import * as vscode from 'vscode';
import { NoteIndex } from '../index/noteIndex';
import { resolveWikiLinkTarget } from './linkResolution';
import { isInsideFencedCodeBlock, matchWikiLinks } from './linkParsing';

interface WikiDocumentLink extends vscode.DocumentLink {
  wikiTarget: string;
  wikiSection: string | null;
  sourceUri: vscode.Uri;
}

export class WikiLinkDocumentLinkProvider
  implements vscode.DocumentLinkProvider<WikiDocumentLink>
{
  constructor(private readonly index: NoteIndex) {}

  provideDocumentLinks(document: vscode.TextDocument): WikiDocumentLink[] {
    const links: WikiDocumentLink[] = [];
    for (let line = 0; line < document.lineCount; line += 1) {
      const lineText = document.lineAt(line).text;
      const matches = matchWikiLinks(lineText, line);
      for (const match of matches) {
        if (isInsideFencedCodeBlock(document, match.range.start)) {
          continue;
        }
        const target = match.target;
        if (!target) {
          continue;
        }
        // Leave `target` undefined so VS Code calls resolveDocumentLink and
        // we can substitute a real file URI when the note exists. The
        // tooltip overrides the default "Execute command" / "Follow link"
        // hover text with something note-specific.
        const link = new vscode.DocumentLink(match.range) as WikiDocumentLink;
        link.tooltip = `Open note: ${target}`;
        link.wikiTarget = target;
        link.wikiSection = match.section;
        link.sourceUri = document.uri;
        links.push(link);
      }
    }
    return links;
  }

  async resolveDocumentLink(
    link: WikiDocumentLink
  ): Promise<WikiDocumentLink> {
    const target = link.wikiTarget.replace(/\.md$/i, '');
    const resolved = await resolveWikiLinkTarget(
      this.index,
      target,
      link.sourceUri
    );
    if (resolved) {
      // Existing note: navigate to the heading line when a section ref is
      // present (same fallback as DefinitionProvider: line 0 when the heading
      // is not found). Use a `#L{n}` fragment so VS Code opens the file at
      // the correct line.
      const line = link.wikiSection
        ? (this.index.findHeadingLine(resolved, link.wikiSection) ?? 0)
        : 0;
      link.target = line > 0 ? resolved.with({ fragment: `L${line + 1}` }) : resolved;
    } else {
      // Missing note: fall back to the command URI so the openWikiLink
      // handler can prompt the user to create it.
      link.target = createCommandUri(link.wikiTarget);
    }
    return link;
  }
}

function createCommandUri(target: string): vscode.Uri {
  const commandArgs = encodeURIComponent(JSON.stringify([target]));
  return vscode.Uri.parse(`command:markdownLoom.openWikiLink?${commandArgs}`);
}
