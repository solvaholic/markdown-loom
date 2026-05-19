import * as path from 'path';
import * as vscode from 'vscode';
import {
  getNewNoteLocationConfig,
  resolveNewNoteDirectory,
} from './linkCommands';

/**
 * Drag-and-drop file insertion for markdown editors.
 *
 * Dropping one or more files from Finder or the VS Code Explorer copies
 * each file into the destination folder resolved from
 * `markdownLoom.newNoteLocation` (the same policy used by
 * click-to-create) and inserts a `[[basename.ext]]` wikilink at the drop
 * position, one per line.
 *
 * Collisions are never overwritten - `name.pdf` becomes `name-1.pdf`,
 * `name-2.pdf`, etc., and the final (suffixed) basename is the one
 * inserted. Non-`file:` URIs and drops onto documents outside any
 * workspace folder fall through to VS Code's default drop behavior.
 */
export class AttachmentDropProvider
  implements vscode.DocumentDropEditProvider {
  async provideDocumentDropEdits(
    document: vscode.TextDocument,
    _position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentDropEdit | undefined> {
    const uriListItem = dataTransfer.get('text/uri-list');
    if (!uriListItem) {
      return undefined;
    }

    // Drops onto editors outside any workspace folder fall through.
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return undefined;
    }

    const raw = await uriListItem.asString();
    if (token.isCancellationRequested) {
      return undefined;
    }

    const fileUris = parseUriList(raw).filter((u) => u.scheme === 'file');
    if (fileUris.length === 0) {
      return undefined;
    }

    const location = getNewNoteLocationConfig();
    const destDir = resolveNewNoteDirectory(
      workspaceFolder,
      document.uri,
      location
    );

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(destDir));

    const insertedNames: string[] = [];
    // Track names allocated within this single drop so multi-file drops
    // of the same basename don't collide with each other.
    const reserved = new Set<string>();
    for (const sourceUri of fileUris) {
      if (token.isCancellationRequested) {
        return undefined;
      }
      const finalName = await allocateDestinationName(
        destDir,
        path.basename(sourceUri.fsPath),
        reserved
      );
      const destPath = path.join(destDir, finalName);
      const destUri = vscode.Uri.file(destPath);

      // If the source is already exactly the destination file, skip the
      // copy and just insert a wikilink to the existing file.
      if (sourceUri.fsPath !== destPath) {
        await vscode.workspace.fs.copy(sourceUri, destUri, {
          overwrite: false,
        });
      }
      reserved.add(finalName.toLowerCase());
      insertedNames.push(finalName);
    }

    const insertText = insertedNames
      .map((name) => `[[${name}]]`)
      .join('\n');
    const edit = new vscode.DocumentDropEdit(insertText);
    edit.title =
      insertedNames.length > 1
        ? 'Insert wikilinks (Markdown Loom)'
        : 'Insert wikilink (Markdown Loom)';
    edit.kind = WIKILINK_DROP_EDIT_KIND;
    return edit;
  }
}

/**
 * Drop edit kind for our wikilink insertion. Declared both on the edit
 * and in the registration metadata so VS Code's drop chooser pre-lists
 * it and `Configure preferred drop action...` can target it. Without a
 * `kind` (and a `title`) the chooser filters our edit out entirely.
 */
export const WIKILINK_DROP_EDIT_KIND =
  vscode.DocumentDropOrPasteEditKind.Empty.append(
    'text',
    'markdown',
    'link',
    'wikilink'
  );

/**
 * Parse a `text/uri-list` payload. Lines starting with `#` are comments
 * per RFC 2483; blank lines and unparseable entries are skipped.
 */
export function parseUriList(raw: string): vscode.Uri[] {
  const uris: vscode.Uri[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    try {
      uris.push(vscode.Uri.parse(trimmed, true));
    } catch {
      // Skip unparseable entries.
    }
  }
  return uris;
}

/**
 * Pick a filename in `destDir` that does not exist on disk and is not
 * already reserved by an earlier file in this drop. Collision suffixes
 * are `-1`, `-2`, ... inserted before the extension, matching the
 * pattern in the issue's acceptance criteria.
 */
export async function allocateDestinationName(
  destDir: string,
  basename: string,
  reserved: ReadonlySet<string>
): Promise<string> {
  const ext = path.extname(basename);
  const stem = ext ? basename.slice(0, -ext.length) : basename;

  let candidate = basename;
  let counter = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!reserved.has(candidate.toLowerCase())) {
      const candidatePath = path.join(destDir, candidate);
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(candidatePath));
      } catch {
        return candidate;
      }
    }
    counter += 1;
    candidate = `${stem}-${counter}${ext}`;
  }
}
