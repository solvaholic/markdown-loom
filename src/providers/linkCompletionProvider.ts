import * as path from 'path';
import * as vscode from 'vscode';
import { isInsideFencedCodeBlock } from './linkParsing';

type WikiLinkStyle = 'name' | 'relative' | 'absolute';

interface NoteEntry {
  label: string;
  insertText: string;
  sortText: string;
}

interface NoteInfo {
  uri: vscode.Uri;
  basename: string;
  workspaceRelativePath: string;
}

export class WikiLinkCompletionProvider
  implements vscode.CompletionItemProvider
{
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    if (isInsideFencedCodeBlock(document, position)) {
      return [];
    }

    const lineText = document.lineAt(position.line).text;
    const lastOpen = lineText.lastIndexOf('[[', position.character);
    const lastClose = lineText.lastIndexOf(']]', position.character);
    if (lastOpen === -1 || lastClose > lastOpen) {
      return [];
    }

    const prefix = lineText.slice(lastOpen + 2, position.character);
    const range = new vscode.Range(
      new vscode.Position(position.line, lastOpen + 2),
      position
    );

    const style = readWikiLinkStyle(document.uri);
    const notes = await collectNoteEntries(document.uri, style);
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

async function collectNoteEntries(
  fromUri: vscode.Uri,
  style: WikiLinkStyle
): Promise<NoteEntry[]> {
  const files = await vscode.workspace.findFiles('**/*.md');
  const includeWorkspaceFolder =
    (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
  const noteInfos: NoteInfo[] = [];
  const basenameCounts = new Map<string, number>();

  for (const file of files) {
    const relativePath = getRelativePath(file, includeWorkspaceFolder);
    const pathWithoutExt = relativePath.replace(/\.md$/i, '');
    const basename = pathWithoutExt.split('/').pop() ?? pathWithoutExt;
    const key = basename.toLowerCase();
    basenameCounts.set(key, (basenameCounts.get(key) ?? 0) + 1);
    noteInfos.push({
      uri: file,
      basename,
      workspaceRelativePath: pathWithoutExt
    });
  }

  const entries: NoteEntry[] = [];
  for (const note of noteInfos) {
    const insertText = computeInsertText(note, fromUri, style, basenameCounts);
    const label =
      (basenameCounts.get(note.basename.toLowerCase()) ?? 0) > 1
        ? note.workspaceRelativePath
        : note.basename;
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
  basenameCounts: Map<string, number>
): string {
  if (style === 'absolute') {
    return note.workspaceRelativePath;
  }
  if (style === 'relative') {
    return computeRelativeInsert(note.uri, fromUri);
  }
  const isDuplicate =
    (basenameCounts.get(note.basename.toLowerCase()) ?? 0) > 1;
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

function getRelativePath(uri: vscode.Uri, includeWorkspaceFolder: boolean): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    return uri.fsPath;
  }
  return vscode.workspace.asRelativePath(uri, includeWorkspaceFolder);
}
