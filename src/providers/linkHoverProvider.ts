import * as vscode from 'vscode';
import { NoteIndex } from '../index/noteIndex';
import { findWikiLinkAtPosition, isInsideFencedCodeBlock } from './linkParsing';
import { resolveWikiLinkTarget } from './linkResolution';

/** Max number of source lines to show in a preview before truncating. */
const MAX_PREVIEW_LINES = 40;
/** Cap the cached/decoded body so a giant file can't blow up the hover. */
const MAX_PREVIEW_BYTES = 64 * 1024;
/** Small LRU so repeated hover ticks over the same link don't re-read disk. */
const CACHE_LIMIT = 64;

interface CacheEntry {
  mtime: number;
  text: string;
}

/**
 * Hover over a `[[wikilink]]` shows a rendered markdown preview of the
 * linked note. Only markdown (`.md`) targets are previewed; attachments and
 * missing targets fall through to the DocumentLink tooltip. See docs/SPEC.md
 * "Hover preview". The preview is truncated, frontmatter-stripped, and has its
 * own wikilinks flattened to plain text so the hover never recurses into other
 * notes.
 */
export class WikiLinkHoverProvider implements vscode.HoverProvider {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly index: NoteIndex) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    if (isInsideFencedCodeBlock(document, position)) {
      return null;
    }

    const match = findWikiLinkAtPosition(document, position);
    if (!match) {
      return null;
    }

    const target = await resolveWikiLinkTarget(this.index, match.target, document.uri);
    if (!target || !/\.md$/i.test(target.fsPath)) {
      // Missing or non-markdown targets are intentionally left to the
      // DocumentLink tooltip so we don't stack a second hover on top of it, and
      // we never try to "preview" a binary attachment. Create-note wording is
      // tracked by #59. This provider only previews notes that exist.
      return null;
    }

    const body = await this.readPreviewSource(target);
    if (!body) {
      return null;
    }

    const stripped = stripFrontmatter(body);
    const startLine = match.section
      ? (this.index.findHeadingLine(target, match.section) ?? 0)
      : 0;
    const preview = buildPreview(stripped, startLine);
    if (!preview) {
      return null;
    }

    const md = new vscode.MarkdownString(preview);
    md.isTrusted = false;
    return new vscode.Hover(md, match.range);
  }

  private async readPreviewSource(uri: vscode.Uri): Promise<string> {
    let mtime = 0;
    try {
      mtime = (await vscode.workspace.fs.stat(uri)).mtime;
    } catch {
      return '';
    }
    const key = uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.mtime === mtime) {
      // Refresh LRU recency.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.text;
    }
    let text = '';
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      text = new TextDecoder('utf-8').decode(bytes.slice(0, MAX_PREVIEW_BYTES));
    } catch {
      return '';
    }
    this.cache.set(key, { mtime, text });
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    return text;
  }
}

/** Drop a leading YAML frontmatter block (`---` … `---`) if present. */
export function stripFrontmatter(text: string): string {
  if (!text.startsWith('---')) {
    return text;
  }
  const closing = text.indexOf('\n---', 3);
  if (closing === -1) {
    return text;
  }
  const after = text.indexOf('\n', closing + 1);
  return after === -1 ? '' : text.slice(after + 1);
}

/** Flatten nested wikilinks to their display text so hover doesn't recurse. */
function flattenWikiLinks(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, (_full, body: string) => {
    const pipeIdx = body.indexOf('|');
    return (pipeIdx === -1 ? body : body.slice(pipeIdx + 1)).trim();
  });
}

function buildPreview(text: string, startLine: number): string {
  const lines = text.split('\n').slice(startLine, startLine + MAX_PREVIEW_LINES + 1);
  const truncated = lines.length > MAX_PREVIEW_LINES;
  const shown = flattenWikiLinks(lines.slice(0, MAX_PREVIEW_LINES).join('\n')).trimEnd();
  if (!shown) {
    return '';
  }
  return truncated ? `${shown}\n\n…` : shown;
}
