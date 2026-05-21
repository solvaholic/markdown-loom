import * as path from 'path';
import * as vscode from 'vscode';
import { NoteIndex } from '../index/noteIndex';
import { resolveWikiLinkTarget } from './linkResolution';
import { parseWikiLinkBody } from './linkParsing';

export type CreateMissingNotePolicy = 'prompt' | 'auto' | 'never';

export type NewFileLocationMode =
  | 'workspaceRoot'
  | 'sameFolderAsActive'
  | 'customPath';

export interface NewFileLocationConfig {
  mode: NewFileLocationMode;
  customPath?: string;
}

function getCreateMissingNotePolicy(): CreateMissingNotePolicy {
  const value = vscode.workspace
    .getConfiguration('markdownLoom')
    .get<string>('createMissingNoteOnClick', 'prompt');
  if (value === 'auto' || value === 'never') {
    return value;
  }
  return 'prompt';
}

export function getNewFileLocationConfig(): NewFileLocationConfig {
  const cfg = vscode.workspace.getConfiguration('markdownLoom');
  const raw = cfg.get<string>('newFileLocation', 'workspaceRoot');
  const mode: NewFileLocationMode =
    raw === 'sameFolderAsActive' || raw === 'customPath'
      ? raw
      : 'workspaceRoot';
  const customPath = cfg.get<string>('newFileCustomPath', '') ?? '';
  return { mode, customPath };
}

export function resolveNewNoteDirectory(
  workspaceFolder: vscode.WorkspaceFolder,
  fromUri: vscode.Uri,
  location: NewFileLocationConfig
): string {
  const root = workspaceFolder.uri.fsPath;
  if (location.mode === 'sameFolderAsActive') {
    // Fall back to workspace root when the source isn't a real file URI
    // (e.g., untitled buffers) per the issue's open question.
    if (fromUri.scheme === 'file' && fromUri.fsPath) {
      return path.dirname(fromUri.fsPath);
    }
    return root;
  }
  if (location.mode === 'customPath') {
    const trimmed = (location.customPath ?? '').trim();
    if (!trimmed) {
      return root;
    }
    // Resolve workspace-relative; refuse to escape the source workspace folder.
    const candidate = path.resolve(root, trimmed);
    const rel = path.relative(root, candidate);
    if (rel === '' ) {
      return root;
    }
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return root;
    }
    return candidate;
  }
  return root;
}

export function createWikiLinkCommandHandler(
  index: NoteIndex
): (target?: string) => Promise<void> {
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

    // Strip alias and any trailing `.md` so the resolver sees a bare basename.
    const parsed = parseWikiLinkBody(targetFromLink);
    if (!parsed) {
      return;
    }
    const target = parsed.target.replace(/\.md$/i, '');
    const resolved = await resolveWikiLinkTarget(index, target, document.uri);
    if (resolved) {
      await vscode.window.showTextDocument(resolved, { preview: false });
      return;
    }

    const created = await createMissingNote(
      target,
      document.uri,
      getCreateMissingNotePolicy(),
      getNewFileLocationConfig()
    );
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

export async function createMissingNote(
  target: string,
  fromUri: vscode.Uri,
  policy: CreateMissingNotePolicy = 'prompt',
  location: NewFileLocationConfig = { mode: 'workspaceRoot' }
): Promise<vscode.Uri | null> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(fromUri);
  if (!workspaceFolder) {
    return null;
  }

  const relativePath = target.endsWith('.md') ? target : `${target}.md`;
  const directory = resolveNewNoteDirectory(workspaceFolder, fromUri, location);
  const filePath = path.join(directory, relativePath);
  const fileUri = vscode.Uri.file(filePath);

  try {
    await vscode.workspace.fs.stat(fileUri);
    return fileUri;
  } catch {
    if (policy === 'never') {
      return null;
    }
    if (policy === 'prompt') {
      const action = await vscode.window.showInformationMessage(
        `Create note "${target}"?`,
        'Create'
      );
      if (action !== 'Create') {
        return null;
      }
    }
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.file(path.dirname(filePath))
    );
    await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
    return fileUri;
  }
}
