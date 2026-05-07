import MarkdownIt from 'markdown-it';

// Anchored, non-global so each call is stateless. The previous /g pattern
// shared lastIndex across markdown-it inline rule invocations, which made
// later wikilinks in a document silently fail to render.
const WIKILINK_AT_START = /^\[\[([^\]\n]+)\]\]/;

export class WikiLinkRenderer {
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

      const linkTarget = match[1].trim();
      if (!linkTarget) {
        return false;
      }

      const fenceBalance = countFencesBefore(state.src, state.pos);
      if (fenceBalance % 2 === 1) {
        return false;
      }

      if (!silent) {
        const tokenOpen = state.push('link_open', 'a', 1);
        tokenOpen.attrs = [
          ['href', buildPreviewHref(linkTarget)],
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

// Render wikilinks with a plain relative file href so VS Code's markdown
// preview treats them as ordinary links (resolved relative to the source
// file). `command:` URIs are sanitized out of the preview by default, which
// is why the previous renderer produced unclickable text.
function buildPreviewHref(target: string): string {
  const withExt = /\.md$/i.test(target) ? target : `${target}.md`;
  return withExt
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
