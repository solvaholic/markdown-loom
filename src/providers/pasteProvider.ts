import * as path from 'path';
import * as vscode from 'vscode';
import {
  getNewFileLocationConfig,
  NewFileLocationConfig,
} from './linkCommands';

/**
 * Paste-driven file insertion for markdown editors.
 *
 * Pasting one or more files (e.g. a Finder copy of a PDF, or a file
 * copied from the VS Code Explorer) into a markdown editor copies each
 * file into the destination folder resolved from
 * `markdownLoom.newFileLocation` (the same policy used by
 * click-to-create) and inserts a `[[basename.ext]]` wikilink at the
 * cursor, one per line.
 *
 * Paste is the primary attachment gesture because, unlike a plain
 * drag-from-Finder, it routes through a `DocumentPasteEditProvider`
 * without being intercepted by the workbench's "open dropped file as
 * editor" handler (see issue #23 and the closed PR #36).
 *
 * Everything is resolved in URI space rather than via `file:` paths so
 * the feature works in remote windows (Dev Containers, Codespaces, SSH,
 * WSL). In those setups a file pasted from the local machine arrives as
 * a `vscode-local:` URI while the workspace lives on `vscode-remote:`;
 * the provider reads the source bytes and writes them into the
 * workspace regardless of the schemes involved.
 *
 * Collisions are never overwritten - `name.pdf` becomes `name-1.pdf`,
 * `name-2.pdf`, etc., and the final (suffixed) basename is the one
 * inserted. If the source file *is* the file already at the resolved
 * destination, no copy is made and the existing basename is used
 * verbatim. Non-file payloads (URLs, plain text) and pastes into
 * documents outside any workspace folder fall through to VS Code's
 * default paste behavior.
 */
export class AttachmentPasteProvider
  implements vscode.DocumentPasteEditProvider {
  async provideDocumentPasteEdits(
    document: vscode.TextDocument,
    _ranges: readonly vscode.Range[],
    dataTransfer: vscode.DataTransfer,
    _context: vscode.DocumentPasteEditContext,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentPasteEdit[] | undefined> {
    if (!isPasteEnabled()) {
      return undefined;
    }

    // Pastes into editors outside any workspace folder fall through.
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return undefined;
    }

    const files = await collectPastedFiles(dataTransfer);
    if (token.isCancellationRequested) {
      return undefined;
    }
    if (files.length === 0) {
      return undefined;
    }

    const destDirUri = resolveDestinationDirUri(
      workspaceFolder,
      document.uri,
      getNewFileLocationConfig()
    );

    await vscode.workspace.fs.createDirectory(destDirUri);

    const insertedNames: string[] = [];
    // Track names allocated within this single paste so multi-file
    // pastes of the same basename don't collide with each other.
    const reserved = new Set<string>();
    for (const file of files) {
      if (token.isCancellationRequested) {
        return undefined;
      }
      const finalName = await allocateDestinationName(
        destDirUri,
        file.name,
        reserved,
        file.sourceUri
      );
      const destUri = vscode.Uri.joinPath(destDirUri, finalName);

      // Skip the copy when the source already *is* the destination
      // file, so pasting a file from where it already lives in the
      // workspace links to the existing file rather than creating a
      // `-1` duplicate.
      if (!(file.sourceUri && isSameTarget(file.sourceUri, destUri))) {
        await copyPastedFile(file, destUri);
      }
      reserved.add(finalName.toLowerCase());
      insertedNames.push(finalName);
    }

    const insertText = insertedNames.map((name) => `[[${name}]]`).join('\n');
    const title =
      insertedNames.length > 1
        ? 'Insert wikilinks (Markdown Loom)'
        : 'Insert wikilink (Markdown Loom)';
    const edit = new vscode.DocumentPasteEdit(
      insertText,
      title,
      WIKILINK_PASTE_EDIT_KIND
    );
    return [edit];
  }
}

/** A file gathered from a paste, ready to copy into the workspace. */
interface PastedFile {
  /** Basename (with extension) to use at the destination. */
  name: string;
  /** Source URI, when the paste carried one (absent for raw clipboard bytes). */
  sourceUri?: vscode.Uri;
  /** Read the file's bytes, regardless of the source scheme. */
  read(): Promise<Uint8Array>;
}

/**
 * Read the `markdownLoom.attachments.paste.enabled` escape hatch.
 * Defaults to `true`; set it to `false` to fall through to VS Code's
 * default paste behavior for files.
 */
function isPasteEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('markdownLoom')
    .get<boolean>('attachments.paste.enabled', true);
}

/**
 * Paste edit kind for our wikilink insertion. Declared both on the edit
 * and in the registration metadata so VS Code's paste chooser pre-lists
 * it and `Configure preferred paste action...` can target it. Without a
 * `kind` (and a `title`) the chooser filters our edit out entirely. It
 * is a sibling of core's `markdown.link.*` kinds so the two coexist in
 * the chooser when both fire (e.g. pasting an image).
 */
export const WIKILINK_PASTE_EDIT_KIND =
  vscode.DocumentDropOrPasteEditKind.Empty.append(
    'markdown',
    'link',
    'wikilink'
  );

/**
 * MIME types VS Code may populate for editor pastes. Internal copies
 * (Explorer, search results) use `text/uri-list`; external OS pastes
 * (Finder, Windows Explorer) populate `application/vnd.code.uri-list`
 * and/or expose `DataTransferFile` entries surfaced via the generic
 * `files` key. Declaring all three ensures the provider is invoked for
 * both code paths.
 */
export const PASTE_MIME_TYPES: readonly string[] = [
  'text/uri-list',
  'application/vnd.code.uri-list',
  'files',
];

/**
 * Resolve the destination directory as a URI on the workspace folder's
 * own scheme/authority, so attachments land in the right place in both
 * local and remote (Dev Container, Codespaces, SSH, WSL) windows.
 *
 * Mirrors `resolveNewNoteDirectory` but stays in URI space and derives
 * `sameFolderAsActive` from the active document's URI directly (rather
 * than its `file:` path), which is what makes it correct under remote
 * schemes.
 */
export function resolveDestinationDirUri(
  workspaceFolder: vscode.WorkspaceFolder,
  documentUri: vscode.Uri,
  location: NewFileLocationConfig
): vscode.Uri {
  const rootUri = workspaceFolder.uri;
  if (location.mode === 'sameFolderAsActive') {
    // Parent folder of the active note, preserving scheme/authority.
    return vscode.Uri.joinPath(documentUri, '..');
  }
  if (location.mode === 'customPath') {
    const trimmed = (location.customPath ?? '').trim();
    if (!trimmed || path.isAbsolute(trimmed)) {
      return rootUri;
    }
    const segments = trimmed.split(/[\\/]+/).filter((s) => s.length > 0);
    // Refuse to escape the workspace folder.
    if (segments.length === 0 || segments.includes('..')) {
      return rootUri;
    }
    return vscode.Uri.joinPath(rootUri, ...segments);
  }
  return rootUri;
}

/**
 * Copy a pasted file into the workspace. When the source and
 * destination share a scheme and authority (the common local
 * `file:` -> `file:` case), use the filesystem's native copy. Otherwise
 * - e.g. a `vscode-local:` source pasted into a `vscode-remote:`
 * workspace - read the bytes and write them across the bridge.
 */
async function copyPastedFile(
  file: PastedFile,
  destUri: vscode.Uri
): Promise<void> {
  const source = file.sourceUri;
  if (
    source &&
    source.scheme === destUri.scheme &&
    source.authority === destUri.authority
  ) {
    await vscode.workspace.fs.copy(source, destUri, { overwrite: false });
    return;
  }
  const bytes = await file.read();
  await vscode.workspace.fs.writeFile(destUri, bytes);
}

/**
 * Gather pastable files from any of the shapes VS Code may use for an
 * editor paste: `DataTransferFile` entries (OS pastes, which also carry
 * the bytes directly) and `text/uri-list` /
 * `application/vnd.code.uri-list` payloads. Web URLs and other
 * non-readable URIs are filtered out by attempting to `stat` them, so a
 * pasted link falls through to VS Code's default behavior. Schemes are
 * not restricted to `file:` - `vscode-local:` and `vscode-remote:`
 * sources are accepted so the feature works in remote windows.
 */
async function collectPastedFiles(
  dataTransfer: vscode.DataTransfer
): Promise<PastedFile[]> {
  const files: PastedFile[] = [];
  const seen = new Set<string>();

  // DataTransferFile entries are the most reliable source for OS pastes:
  // they expose the basename and the bytes without a second read.
  const dataFiles: vscode.DataTransferFile[] = [];
  dataTransfer.forEach((item) => {
    const file = item.asFile?.();
    if (file) {
      dataFiles.push(file);
    }
  });
  for (const file of dataFiles) {
    const key = file.uri ? file.uri.toString() : `name:${file.name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    files.push({
      name: file.name,
      sourceUri: file.uri,
      read: () => Promise.resolve(file.data()),
    });
  }

  for (const mime of ['text/uri-list', 'application/vnd.code.uri-list']) {
    const item = dataTransfer.get(mime);
    if (!item) {
      continue;
    }
    let raw: string;
    try {
      raw = await item.asString();
    } catch {
      // Ignore unreadable entries; we may still have picked up files above.
      continue;
    }
    for (const uri of parseUriList(raw)) {
      const key = uri.toString();
      if (seen.has(key)) {
        continue;
      }
      // Only treat URIs that resolve to a readable file as pastable.
      // This skips web URLs (no filesystem provider -> stat throws) and
      // directories, both of which should fall through.
      if (!(await isReadableFile(uri))) {
        continue;
      }
      seen.add(key);
      files.push({
        name: basenameFromUri(uri),
        sourceUri: uri,
        read: () => Promise.resolve(vscode.workspace.fs.readFile(uri)),
      });
    }
  }

  return files;
}

/**
 * True when `uri` points at a readable file on some registered
 * filesystem. Web URLs (`http`/`https`/`mailto`/...) have no provider
 * and throw; directories are rejected so only files are pasted.
 */
async function isReadableFile(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return (stat.type & vscode.FileType.Directory) === 0;
  } catch {
    return false;
  }
}

/** Basename (with extension) from a URI's POSIX path. */
function basenameFromUri(uri: vscode.Uri): string {
  return path.posix.basename(uri.path);
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
 * Case-insensitive same-target comparison for two URIs on the default
 * macOS/Windows filesystems. URIs on different schemes or authorities
 * are never the same target (e.g. a `vscode-local:` source can never
 * equal a `vscode-remote:` destination).
 */
function isSameTarget(a: vscode.Uri, b: vscode.Uri): boolean {
  if (a.scheme !== b.scheme || a.authority !== b.authority) {
    return false;
  }
  if (a.path === b.path) {
    return true;
  }
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return a.path.toLowerCase() === b.path.toLowerCase();
  }
  return false;
}

/**
 * Pick a filename in `destDirUri` that does not exist and is not already
 * reserved by an earlier file in this paste. Collision suffixes are
 * `-1`, `-2`, ... inserted before the extension, matching the pattern in
 * the issue's acceptance criteria.
 *
 * When `sourceUri` is supplied and matches the candidate (same scheme,
 * authority, and path, case-insensitively on case-insensitive
 * filesystems), the candidate is treated as a no-op rather than a
 * collision - pasting a file from where it already lives in the
 * workspace should never produce a `-1` duplicate.
 */
export async function allocateDestinationName(
  destDirUri: vscode.Uri,
  basename: string,
  reserved: ReadonlySet<string>,
  sourceUri?: vscode.Uri
): Promise<string> {
  const ext = path.extname(basename);
  const stem = ext ? basename.slice(0, -ext.length) : basename;

  let candidate = basename;
  let counter = 0;
  while (true) {
    if (!reserved.has(candidate.toLowerCase())) {
      const candidateUri = vscode.Uri.joinPath(destDirUri, candidate);
      try {
        await vscode.workspace.fs.stat(candidateUri);
        // Existing file at the candidate path: if it *is* the source,
        // reuse the name as-is (no copy, no suffix). Otherwise this is
        // a real collision, fall through and bump the counter.
        if (sourceUri && isSameTarget(sourceUri, candidateUri)) {
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
