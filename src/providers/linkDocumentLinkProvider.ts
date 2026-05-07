import * as vscode from 'vscode';
import { NoteIndex } from '../index/noteIndex';
import { resolveWikiLinkTarget } from './linkResolution';
import { isInsideFencedCodeBlock, matchWikiLinks } from './linkParsing';

interface WikiDocumentLink extends vscode.DocumentLink {
  wikiTarget: string;
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
      // Existing note: use a file URI so VS Code shows the standard
      // "Follow link" hover and click goes straight to the file.
      link.target = resolved;
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
