import MarkdownIt from 'markdown-it';

export class WikiLinkRenderer {
  extendMarkdownIt(md: MarkdownIt): MarkdownIt {
    const wikilinkPattern = /\[\[([^\]]+)\]\]/g;

    md.inline.ruler.before('link', 'wikilink', (state, silent) => {
      const start = state.pos;
      const src = state.src.slice(start);
      const match = wikilinkPattern.exec(src);
      if (!match || match.index !== 0) {
        return false;
      }

      const linkTarget = match[1].trim();
      if (!linkTarget) {
        return false;
      }

      const fenceBalance = countFencesBefore(state.src, start);
      if (fenceBalance % 2 === 1) {
        return false;
      }

      if (!silent) {
        const tokenOpen = state.push('link_open', 'a', 1);
        tokenOpen.attrs = [
          [
            'href',
            `command:markdownLoom.openWikiLink?${encodeURIComponent(
              JSON.stringify([linkTarget])
            )}`
          ],
          ['data-wikilink', linkTarget]
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
