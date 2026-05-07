import * as path from 'path';
import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { NoteIndex } from '../index/noteIndex';

// Anchored, non-global so each call is stateless. The previous /g pattern
// shared lastIndex across markdown-it inline rule invocations, which made
// later wikilinks in a document silently fail to render.
const WIKILINK_AT_START = /^\[\[([^\]\n]+)\]\]/;

export class WikiLinkRenderer {
  constructor(private readonly index?: NoteIndex) {}

  extendMarkdownIt(md: MarkdownIt): MarkdownIt {
    const index = this.index;

    md.inline.ruler.before('link', 'wikilink', (state, silent) => {
      if (state.src.charCodeAt(state.pos) !== 0x5b /* [ */) {
        return false;
      }
      if (state.src.charCodeAt(state.pos + 1) !== 0x5b /* [ */) {
        return false;
      }

      const match = WIKILINK_AT_START.exec(state.src.slice(state.pos));
      if (!match) {
        return false;
      }

      const linkTarget = match[1].trim();
      if (!linkTarget) {
        return false;
      }

      const fenceBalance = countFencesBefore(state.src, state.pos);
      if (fenceBalance % 2 === 1) {
        return false;
      }

      if (!silent) {
        const sourceUri = readSourceUri(state.env);
        const href = buildPreviewHref(linkTarget, sourceUri, index);
        const tokenOpen = state.push('link_open', 'a', 1);
        tokenOpen.attrs = [
          ['href', href],
          ['class', 'markdown-loom-wikilink'],
          ['data-wikilink', linkTarget],
          ['title', `Open note: ${linkTarget}`]
        ];
        const textToken = state.push('text', '', 0);
        textToken.content = linkTarget;
        state.push('link_close', 'a', -1);
      }

      state.pos += match[0].length;
      return true;
    });

    return md;
  }
}

// VS Code's markdown preview passes the source document's URI through
// markdown-it's `env`. The exact key has varied between versions, so try
// the documented spellings in order. Returns null when called outside the
// VS Code preview (e.g. from the unit test suite or a CLI render).
function readSourceUri(env: unknown): vscode.Uri | null {
  if (!env || typeof env !== 'object') {
    return null;
  }
  const e = env as Record<string, unknown>;
  for (const key of ['currentDocument', 'resource', 'containingResource']) {
    const value = e[key];
    if (value instanceof vscode.Uri) {
      return value;
    }
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as { fsPath?: unknown }).fsPath === 'string' &&
      typeof (value as { scheme?: unknown }).scheme === 'string'
    ) {
      // VS Code may pass a serialized Uri-like object across the preview
      // boundary; rehydrate it so path math below works.
      const serialized = value as { scheme: string; path?: string; fsPath: string };
      return vscode.Uri.file(serialized.fsPath);
    }
  }
  return null;
}

// Render wikilinks with a relative file href so VS Code's markdown preview
// treats them as ordinary links. When we know the source document and have
// a NoteIndex available, resolve the target the same way the editor's
// DocumentLinkProvider does so cross-root links (e.g. `[[rootB/Foo]]` from
// `rootA/Index.md`) reach the correct file. Falls back to a naive
// relative path so unit tests and same-folder links still work without
// an index.
function buildPreviewHref(
  target: string,
  sourceUri: vscode.Uri | null,
  index: NoteIndex | undefined
): string {
  if (sourceUri && index) {
    const normalized = target.replace(/\.md$/i, '');
    const resolved = index.resolve(normalized, sourceUri);
    if (resolved) {
      const sourceDir = path.dirname(sourceUri.fsPath);
      let rel = path.relative(sourceDir, resolved.fsPath);
      if (!rel || rel.startsWith('..') === false) {
        // Force a leading ./ for same-folder targets so the preview does
        // not interpret a bare `Foo.md` ambiguously.
        rel = `./${rel}`;
      }
      return encodePath(rel);
    }
  }
  const withExt = /\.md$/i.test(target) ? target : `${target}.md`;
  return encodePath(withExt);
}

function encodePath(p: string): string {
  return p
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function countFencesBefore(text: string, offset: number): number {
  const fencePattern = /(^|\n)(```|~~~)/g;
  let match: RegExpExecArray | null;
  let count = 0;
  fencePattern.lastIndex = 0;
  while ((match = fencePattern.exec(text)) !== null) {
    if (match.index >= offset) {
      break;
    }
    count += 1;
  }
  return count;
}
