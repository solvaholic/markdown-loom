import * as path from 'path';
import * as vscode from 'vscode';
import { NoteIndex, NoteInfo } from '../index/noteIndex';
import { isInsideFencedCodeBlock } from './linkParsing';

type WikiLinkStyle = 'name' | 'relative' | 'absolute';

interface NoteEntry {
  label: string;
  insertText: string;
  sortText: string;
}

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

    const style = readWikiLinkStyle(document.uri);
    await this.index.ready();
    const notes = collectNoteEntries(this.index, document.uri, style);
    return notes
      .filter((entry) =>
        entry.label.toLowerCase().includes(prefix.toLowerCase())
      )
      .map((entry) => {
        const item = new vscode.CompletionItem(
          entry.label,
          vscode.CompletionItemKind.File
        );
        item.insertText = entry.insertText;
        item.sortText = entry.sortText;
        item.range = range;
        return item;
      });
  }
}

function readWikiLinkStyle(scope: vscode.Uri): WikiLinkStyle {
  const config = vscode.workspace.getConfiguration('markdownLoom', scope);
  const value = config.get<string>('wikiLinkStyle', 'name');
  if (value === 'relative' || value === 'absolute' || value === 'name') {
    return value;
  }
  return 'name';
}

function collectNoteEntries(
  index: NoteIndex,
  fromUri: vscode.Uri,
  style: WikiLinkStyle
): NoteEntry[] {
  const notes = index.getNotes();
  const basenameCounts = new Map<string, number>();
  for (const note of notes) {
    const key = note.basename.toLowerCase();
    basenameCounts.set(key, (basenameCounts.get(key) ?? 0) + 1);
  }

  const entries: NoteEntry[] = [];
  for (const note of notes) {
    const isDuplicate =
      (basenameCounts.get(note.basename.toLowerCase()) ?? 0) > 1;
    const insertText = computeInsertText(note, fromUri, style, isDuplicate);
    const label = isDuplicate ? note.workspaceRelativePath : note.basename;
    entries.push({
      label,
      insertText,
      sortText: label.toLowerCase()
    });
  }

  return entries;
}

function computeInsertText(
  note: NoteInfo,
  fromUri: vscode.Uri,
  style: WikiLinkStyle,
  isDuplicate: boolean
): string {
  if (style === 'absolute') {
    return note.workspaceRelativePath;
  }
  if (style === 'relative') {
    return computeRelativeInsert(note.uri, fromUri);
  }
  return isDuplicate ? note.workspaceRelativePath : note.basename;
}

function computeRelativeInsert(
  targetUri: vscode.Uri,
  fromUri: vscode.Uri
): string {
  const fromDir = path.dirname(fromUri.fsPath);
  let rel = path.relative(fromDir, targetUri.fsPath).replace(/\\/g, '/');
  rel = rel.replace(/\.md$/i, '');
  if (!rel.startsWith('.') && !rel.startsWith('/')) {
    rel = `./${rel}`;
  }
  return rel;
}
