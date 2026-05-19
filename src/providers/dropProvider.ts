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
 * inserted. If the source file *is* the destination (the user dragged
 * a file from its existing workspace location), no copy is made and
 * the existing basename is used verbatim. Non-`file:` URIs and drops
 * onto documents outside any workspace folder fall through to VS
 * Code's default drop behavior.
 */
export class AttachmentDropProvider
  implements vscode.DocumentDropEditProvider {
  async provideDocumentDropEdits(
    document: vscode.TextDocument,
    _position: vscode.Position,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentDropEdit | undefined> {
    // Drops onto editors outside any workspace folder fall through.
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return undefined;
    }

    const fileUris = await collectDroppedFileUris(dataTransfer);
    if (token.isCancellationRequested) {
      return undefined;
    }
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
      const sourceFsPath = sourceUri.fsPath;
      const finalName = await allocateDestinationName(
        destDir,
        path.basename(sourceFsPath),
        reserved,
        sourceFsPath
      );
      const destPath = path.join(destDir, finalName);
      const destUri = vscode.Uri.file(destPath);

      // Skip the copy when the source already *is* the destination
      // file. Compare via realpath-style equality so a user who drags
      // a file from where it already lives in the workspace (Explorer
      // drag) gets a link to the existing file rather than a
      // duplicated `-1` copy. Case-insensitive comparison covers the
      // default macOS/Windows filesystems.
      if (!isSameFile(sourceFsPath, destPath)) {
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
 * MIME types VS Code may populate for editor drops. Internal drags
 * (Explorer, search results) use `text/uri-list`; external OS drops
 * (Finder, Windows Explorer) populate `application/vnd.code.uri-list`
 * and/or the generic `Files` entry. Declaring all three ensures the
 * provider is invoked for both code paths.
 */
export const DROP_MIME_TYPES: readonly string[] = [
  'text/uri-list',
  'application/vnd.code.uri-list',
  'files',
];

/**
 * Collect `file:` URIs from any of the MIME shapes VS Code may use for
 * an editor drop. Reads `text/uri-list` first (the internal-drag
 * canonical), then the workbench's external-drop uri-list, then falls
 * back to iterating `DataTransferFile` items for OS-level file drops.
 */
async function collectDroppedFileUris(
  dataTransfer: vscode.DataTransfer
): Promise<vscode.Uri[]> {
  const seen = new Set<string>();
  const uris: vscode.Uri[] = [];
  const push = (uri: vscode.Uri | undefined): void => {
    if (!uri || uri.scheme !== 'file') {
      return;
    }
    const key = uri.fsPath;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    uris.push(uri);
  };

  for (const mime of ['text/uri-list', 'application/vnd.code.uri-list']) {
    const item = dataTransfer.get(mime);
    if (!item) {
      continue;
    }
    try {
      const raw = await item.asString();
      for (const uri of parseUriList(raw)) {
        push(uri);
      }
    } catch {
      // Ignore unreadable entries; we may still pick up files below.
    }
  }

  // External OS drops (Finder, Explorer) expose each file as a
  // DataTransferItem whose asFile() returns a DataTransferFile with a
  // populated `uri`. Iterate the whole transfer to be robust to the
  // exact MIME key (some builds key by extension, some by `Files`).
  dataTransfer.forEach((item) => {
    const file = item.asFile?.();
    if (file?.uri) {
      push(file.uri);
    }
  });

  return uris;
}

/**
 * Parse a `text/uri-list` payload. Lines starting with `#` are comments
 * per RFC 2483; blank lines are skipped. Falls back to non-strict
 * parsing so that OS-produced URIs (which occasionally elide encoding
 * the strict parser expects) still resolve.
 */
export function parseUriList(raw: string): vscode.Uri[] {
  const uris: vscode.Uri[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    let parsed: vscode.Uri | undefined;
    try {
      parsed = vscode.Uri.parse(trimmed, true);
    } catch {
      try {
        parsed = vscode.Uri.parse(trimmed, false);
      } catch {
        parsed = undefined;
      }
    }
    if (parsed) {
      uris.push(parsed);
    }
  }
  return uris;
}

/**
 * Case-insensitive same-file comparison appropriate for the default
 * macOS/Windows filesystems. Linux is case-sensitive; on the worst
 * case the comparison is conservative (we may treat two different
 * files as same and skip a copy) but in practice the dragged-source
 * path equals the candidate destination path exactly.
 */
function isSameFile(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  if (ra === rb) {
    return true;
  }
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return ra.toLowerCase() === rb.toLowerCase();
  }
  return false;
}

/**
 * Pick a filename in `destDir` that does not exist on disk and is not
 * already reserved by an earlier file in this drop. Collision suffixes
 * are `-1`, `-2`, ... inserted before the extension, matching the
 * pattern in the issue's acceptance criteria.
 *
 * When `sourceFsPath` is supplied and matches the candidate path
 * (case-insensitively on filesystems that are case-insensitive),
 * the candidate is treated as a no-op rather than a collision -
 * dragging a file from where it already lives in the workspace
 * should never produce a `-1` duplicate.
 */
export async function allocateDestinationName(
  destDir: string,
  basename: string,
  reserved: ReadonlySet<string>,
  sourceFsPath?: string
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
        // Existing file at the candidate path: if it *is* the source,
        // reuse the name as-is (no copy, no suffix). Otherwise this is
        // a real collision, fall through and bump the counter.
        if (sourceFsPath && isSameFile(sourceFsPath, candidatePath)) {
          return candidate;
        }
      } catch {
        return candidate;
      }
    }
    counter += 1;
    candidate = `${stem}-${counter}${ext}`;
  }
}
