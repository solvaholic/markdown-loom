import * as path from 'path';
import * as vscode from 'vscode';
import { resolveWikiLinkTarget } from './linkResolution';

export function createWikiLinkCommandHandler(): (target?: string) => Promise<void> {
  return async (targetInput?: string) => {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    const position = editor?.selection.active;

    const targetFromLink = targetInput ?? (document && position
      ? extractTargetFromLine(document, position)
      : null);

    if (!targetFromLink || !document) {
      return;
    }

    const target = targetFromLink.replace(/\.md$/i, '');
    const resolved = await resolveWikiLinkTarget(target, document.uri);
    if (resolved) {
      await vscode.window.showTextDocument(resolved, { preview: false });
      return;
    }

    const created = await createMissingNote(target, document.uri);
    if (created) {
      await vscode.window.showTextDocument(created, { preview: false });
    }
  };
}

function extractTargetFromLine(
  document: vscode.TextDocument,
  position: vscode.Position
): string | null {
  const lineText = document.lineAt(position.line).text;
  const lastOpen = lineText.lastIndexOf('[[', position.character);
  const lastClose = lineText.lastIndexOf(']]', position.character);
  if (lastOpen === -1 || lastClose < lastOpen) {
    return null;
  }
  const target = lineText.slice(lastOpen + 2, lastClose).trim();
  return target.length ? target : null;
}

async function createMissingNote(
  target: string,
  fromUri: vscode.Uri
): Promise<vscode.Uri | null> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(fromUri);
  if (!workspaceFolder) {
    return null;
  }

  const relativePath = target.endsWith('.md') ? target : `${target}.md`;
  const filePath = path.join(workspaceFolder.uri.fsPath, relativePath);
  const fileUri = vscode.Uri.file(filePath);

  try {
    await vscode.workspace.fs.stat(fileUri);
    return fileUri;
  } catch {
    const action = await vscode.window.showInformationMessage(
      `Create note "${target}"?`,
      'Create'
    );
    if (action !== 'Create') {
      return null;
    }
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.file(path.dirname(filePath))
    );
    await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
    return fileUri;
  }
}
