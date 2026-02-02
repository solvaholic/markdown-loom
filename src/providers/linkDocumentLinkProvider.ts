import * as vscode from 'vscode';
import { isInsideFencedCodeBlock, matchWikiLinks } from './linkParsing';

export class WikiLinkDocumentLinkProvider
  implements vscode.DocumentLinkProvider
{
  provideDocumentLinks(
    document: vscode.TextDocument
  ): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
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
        const link = new vscode.DocumentLink(
          match.range,
          createCommandUri(target)
        );
        links.push(link);
      }
    }
    return links;
  }
}

function createCommandUri(target: string): vscode.Uri {
  const commandArgs = encodeURIComponent(JSON.stringify([target]));
  return vscode.Uri.parse(`command:markdownLoom.openWikiLink?${commandArgs}`);
}
