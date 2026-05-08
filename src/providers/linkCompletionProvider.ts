import * as vscode from 'vscode';
import { NoteIndex } from '../index/noteIndex';
import { isInsideFencedCodeBlock } from './linkParsing';

export class WikiLinkCompletionProvider
  implements vscode.CompletionItemProvider
{
  constructor(private readonly index: NoteIndex) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    if (isInsideFencedCodeBlock(document, position)) {
      return [];
    }

    const lineText = document.lineAt(position.line).text;
    const lastOpen = lineText.lastIndexOf('[[', position.character);
    if (lastOpen === -1) {
      return [];
    }
    // Bail only if a closing `]]` sits strictly between `[[` and the cursor;
    // when auto-closing brackets insert `]]` at/after the cursor, we should
    // still complete.
    const closeBetween = lineText.indexOf(']]', lastOpen + 2);
    if (closeBetween !== -1 && closeBetween < position.character) {
      return [];
    }

    const prefix = lineText.slice(lastOpen + 2, position.character);
    const range = new vscode.Range(
      new vscode.Position(position.line, lastOpen + 2),
      position
    );

    await this.index.ready();
    // Per docs/SPEC.md "Wikilink target syntax", legal targets are bare
    // basenames only. Always insert the basename and let users disambiguate
    // collisions by renaming or adding aliases (e.g. `[[Foo|alias]]`).
    const notes = this.index.getNotes();
    return notes
      .filter((note) =>
        note.basename.toLowerCase().includes(prefix.toLowerCase())
      )
      .map((note) => {
        const item = new vscode.CompletionItem(
          note.basename,
          vscode.CompletionItemKind.File
        );
        item.insertText = note.basename;
        item.sortText = note.basename.toLowerCase();
        // When two notes share a basename, expose the workspace-relative
        // path as a hint so users can pick the one they meant - the inserted
        // text is still just the basename.
        item.detail = note.workspaceRelativePath;
        item.range = range;
        return item;
      });
  }
}
