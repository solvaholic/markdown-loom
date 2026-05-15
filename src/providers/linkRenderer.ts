import * as path from 'path';
import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { NoteIndex, slugifyHeading } from '../index/noteIndex';
import { parseWikiLinkBody } from './linkParsing';

type Token = ReturnType<MarkdownIt['parse']>[number];
type Renderer = MarkdownIt['renderer'];
type LinkOpenRule = NonNullable<Renderer['rules']['link_open']>;

// Anchored, non-global so each call is stateless. The previous /g pattern
// shared lastIndex across markdown-it inline rule invocations, which made
// later wikilinks in a document silently fail to render.
const WIKILINK_AT_START = /^\[\[([^\]\n]+)\]\]/;

const WIKI_TARGET_ATTR = 'data-wikilink';
const WIKI_SECTION_ATTR = 'data-wikilink-section';
const WIKI_BLOCKREF_ATTR = 'data-wikilink-blockref';
const RESOLVED_VIA_ATTR = 'data-resolved-via';

function isBlockRef(section: string | null | undefined): boolean {
  return typeof section === 'string' && section.startsWith('^');
}

function blockRefId(section: string): string {
  return section.startsWith('^') ? section.slice(1) : section;
}

function encodeFragment(fragment: string): string {
  // Encode each char that isn't URL-safe in a fragment. `^` is not in the
  // RFC 3986 fragment grammar (pchar / "/" / "?"), so percent-encode it.
  return encodeURIComponent(fragment);
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class WikiLinkRenderer {
  constructor(private readonly index?: NoteIndex) {}

  extendMarkdownIt(md: MarkdownIt): MarkdownIt {
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

      const parsed = parseWikiLinkBody(match[1]);
      if (!parsed) {
        return false;
      }

      const fenceBalance = countFencesBefore(state.src, state.pos);
      if (fenceBalance % 2 === 1) {
        return false;
      }

      if (!silent) {
        // Emit a placeholder href and stash the raw wikilink target (and
        // optional section ref). The real href is computed in the link_open
        // renderer rule below, because VS Code only populates
        // env.currentDocument during the render phase, not during inline
        // parsing (see microsoft/vscode extensions/markdown-language-features/
        //  src/markdownEngine.ts: tokenizeString sets currentDocument:
        //  undefined, render() sets it to input.uri).
        const fallbackHref = encodeFallback(parsed.target, parsed.section);
        const titleTarget = parsed.section
          ? `${parsed.target}#${parsed.section}`
          : parsed.target;
        const attrs: [string, string][] = [
          ['href', fallbackHref],
          ['class', 'markdown-loom-wikilink'],
          [WIKI_TARGET_ATTR, parsed.target],
          ['title', `Open note: ${titleTarget}`]
        ];
        if (parsed.section) {
          attrs.push([WIKI_SECTION_ATTR, parsed.section]);
          if (isBlockRef(parsed.section)) {
            attrs.push([WIKI_BLOCKREF_ATTR, '1']);
          }
        }
        const tokenOpen = state.push('link_open', 'a', 1);
        tokenOpen.attrs = attrs;
        const textToken = state.push('text', '', 0);
        textToken.content = parsed.display;
        state.push('link_close', 'a', -1);
      }

      state.pos += match[0].length;
      return true;
    });

    // Resolve at render time so we can read env.currentDocument. Wrap the
    // existing link_open renderer (VS Code installs one that adds data-href)
    // so we don't break the preview's link handling.
    const previous = md.renderer.rules.link_open;
    const index = this.index;
    const wikiRule: LinkOpenRule = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const wikiTarget = token.attrGet(WIKI_TARGET_ATTR);
      if (wikiTarget) {
        applyWikiLinkResolution(token, wikiTarget, env, index);
      }
      if (previous) {
        return previous(tokens, idx, options, env, self);
      }
      return self.renderToken(tokens, idx, options);
    };
    md.renderer.rules.link_open = wikiRule;

    // Inject anchor span(s) at the source line of each indexed block id,
    // and strip the literal trailing `^id` from the visible text.
    //
    // This MUST run at render time, not at parse/core time, because VS
    // Code's markdown preview only populates env.currentDocument during
    // render (see microsoft/vscode extensions/markdown-language-features/
    //  src/markdownEngine.ts). Wrapping renderer.render gives us a single
    // pre-render hook where env is fully populated.
    //
    // Idempotency: token.meta.loomBlockrefsApplied guards against repeated
    // mutation if the same token tree is rendered twice.
    const indexForRender = this.index;
    const previousRender = md.renderer.render.bind(md.renderer);
    md.renderer.render = function patchedRender(tokens, options, env) {
      if (indexForRender) {
        const sourceUri = readSourceUri(env);
        if (sourceUri) {
          injectBlockAnchors(tokens, indexForRender.getBlockIds(sourceUri));
        }
      }
      return previousRender(tokens, options, env);
    };

    return md;
  }
}

interface MutableMetaToken {
  type: string;
  map: [number, number] | null;
  content: string;
  children: MutableMetaToken[] | null;
  meta: { loomBlockrefsApplied?: boolean } | null;
}

function injectBlockAnchors(
  tokens: unknown[],
  blockIds: { id: string; line: number }[]
): void {
  if (blockIds.length === 0) {
    return;
  }
  for (const raw of tokens) {
    const token = raw as MutableMetaToken;
    if (token.type !== 'inline' || !token.map) {
      continue;
    }
    if (token.meta && token.meta.loomBlockrefsApplied) {
      continue;
    }
    const [startLine, endLine] = token.map;
    const matches = blockIds.filter(
      (b) => b.line >= startLine && b.line < endLine
    );
    if (matches.length === 0) {
      continue;
    }
    const anchors = matches.map((b) => {
      const anchor: MutableMetaToken = {
        type: 'html_inline',
        map: null,
        content: `<span id="^${escapeHtmlAttr(b.id)}" class="markdown-loom-blockref"></span>`,
        children: null,
        meta: null
      };
      return anchor;
    });
    token.children = [...anchors, ...(token.children ?? [])];
    for (const m of matches) {
      const stripRe = new RegExp(`\\s?\\^${escapeRegex(m.id)}\\s*$`);
      token.content = token.content.replace(stripRe, '');
      if (token.children) {
        for (let i = token.children.length - 1; i >= 0; i -= 1) {
          const child = token.children[i];
          if (child.type === 'text' && stripRe.test(child.content)) {
            child.content = child.content.replace(stripRe, '');
            break;
          }
        }
      }
    }
    token.meta = { ...(token.meta ?? {}), loomBlockrefsApplied: true };
  }
}

function applyWikiLinkResolution(
  token: Token,
  target: string,
  env: unknown,
  index: NoteIndex | undefined
): void {
  const sourceUri = readSourceUri(env);
  // Read the optional section ref stored by the inline rule.
  const section = token.attrGet(WIKI_SECTION_ATTR) ?? null;
  if (!index) {
    setOrAppendAttr(token, RESOLVED_VIA_ATTR, 'fallback-no-index');
    return;
  }
  if (!sourceUri) {
    setOrAppendAttr(token, RESOLVED_VIA_ATTR, 'fallback-no-source');
    return;
  }
  const normalized = target.replace(/\.md$/i, '');
  const resolved = index.resolve(normalized, sourceUri);
  if (!resolved) {
    setOrAppendAttr(token, RESOLVED_VIA_ATTR, 'fallback-not-found');
    return;
  }
  const base = relativeHref(sourceUri, resolved);
  // Build the fragment. For heading refs use the heading slug; for block
  // refs use the literal id (with a leading `^`), percent-encoded for the
  // URL. VS Code's preview decodes the fragment before getElementById, so
  // the injected `<span id="^abc">` matches.
  let href = base;
  if (section) {
    if (isBlockRef(section)) {
      href = `${base}#${encodeFragment('^' + blockRefId(section))}`;
    } else {
      href = `${base}#${slugifyHeading(section)}`;
    }
  }
  token.attrSet('href', href);
  // VS Code's markdown-language-features wraps our extendMarkdownIt with its
  // own link_open rule that runs FIRST and copies the (then-fallback) `href`
  // into `data-href` (see microsoft/vscode extensions/markdown-language-features
  // src/markdownEngine.ts #addLinkRenderer). The preview's click handler reads
  // `data-href` to navigate (preview-src/index.ts), so we must also overwrite
  // it here or the click goes to the source-adjacent fallback path.
  setOrAppendAttr(token, 'data-href', href);
  setOrAppendAttr(token, RESOLVED_VIA_ATTR, 'index');
}

function relativeHref(sourceUri: vscode.Uri, targetUri: vscode.Uri): string {
  const sourceDir = path.dirname(sourceUri.fsPath);
  let rel = path.relative(sourceDir, targetUri.fsPath);
  if (!rel) {
    rel = `./${path.basename(targetUri.fsPath)}`;
  } else if (!rel.startsWith('..')) {
    rel = `./${rel}`;
  }
  // path.relative uses platform separators; href must be POSIX.
  rel = rel.split(path.sep).join('/');
  return encodePath(rel);
}

function setOrAppendAttr(token: Token, name: string, value: string): void {
  const existing = token.attrIndex(name);
  if (existing < 0) {
    token.attrPush([name, value]);
  } else {
    token.attrSet(name, value);
  }
}

// VS Code's markdown preview passes the source document's URI through
// markdown-it's `env.currentDocument` (vscode.Uri | undefined) during the
// render phase. Returns null when called outside the VS Code preview
// (unit tests, CLI renders) or when the engine is in parse-only mode.
function readSourceUri(env: unknown): vscode.Uri | null {
  if (!env || typeof env !== 'object') {
    return null;
  }
  const value = (env as Record<string, unknown>).currentDocument;
  if (value instanceof vscode.Uri) {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { fsPath?: unknown }).fsPath === 'string'
  ) {
    return vscode.Uri.file((value as { fsPath: string }).fsPath);
  }
  return null;
}

function encodeFallback(target: string, section?: string | null): string {
  const withExt = /\.md$/i.test(target) ? target : `${target}.md`;
  const base = encodePath(withExt);
  if (!section) {
    return base;
  }
  if (isBlockRef(section)) {
    return `${base}#${encodeFragment('^' + blockRefId(section))}`;
  }
  return `${base}#${slugifyHeading(section)}`;
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
