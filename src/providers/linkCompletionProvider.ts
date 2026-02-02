import * as vscode from 'vscode';
import { isInsideFencedCodeBlock } from './linkParsing';

interface NoteEntry {
  label: string;
  insertText: string;
  sortText: string;
}

interface NotePathInfo {
  basename: string;
  path: string;
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

    const notes = await collectNoteEntries();
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

async function collectNoteEntries(): Promise<NoteEntry[]> {
  const files = await vscode.workspace.findFiles('**/*.md');
  const includeWorkspaceFolder =
    (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
  const noteInfos: NotePathInfo[] = [];
  const basenameCounts = new Map<string, number>();

  for (const file of files) {
    const relativePath = getRelativePath(file, includeWorkspaceFolder);
    const pathWithoutExt = relativePath.replace(/\.md$/i, '');
    const basename = pathWithoutExt.split('/').pop() ?? pathWithoutExt;
    const key = basename.toLowerCase();
    basenameCounts.set(key, (basenameCounts.get(key) ?? 0) + 1);
    noteInfos.push({ basename, path: pathWithoutExt });
  }

  const entries: NoteEntry[] = [];
  for (const note of noteInfos) {
    const key = note.basename.toLowerCase();
    if ((basenameCounts.get(key) ?? 0) > 1) {
      entries.push({
        label: note.path,
        insertText: note.path,
        sortText: note.path.toLowerCase()
      });
    } else {
      entries.push({
        label: note.basename,
        insertText: note.basename,
        sortText: note.basename.toLowerCase()
      });
    }
  }

  return entries;
}

function getRelativePath(uri: vscode.Uri, includeWorkspaceFolder: boolean): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    return uri.fsPath;
  }
  return vscode.workspace.asRelativePath(uri, includeWorkspaceFolder);
}
