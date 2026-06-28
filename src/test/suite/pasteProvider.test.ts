import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  AttachmentPasteProvider,
  parseUriList,
  allocateDestinationName,
  WIKILINK_PASTE_EDIT_KIND,
} from '../../providers/pasteProvider';

function fixturePath(...parts: string[]): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = folders[0]?.uri.fsPath ?? '';
  return path.join(path.dirname(root), ...parts);
}

function uriFor(...parts: string[]): vscode.Uri {
  return vscode.Uri.file(fixturePath(...parts));
}

async function tryDelete(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri, { useTrash: false, recursive: true });
  } catch {
    // already gone
  }
}

async function writeTempFile(uri: vscode.Uri, contents: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(
    vscode.Uri.file(path.dirname(uri.fsPath))
  );
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(contents));
}

function makeUriListTransfer(uris: vscode.Uri[]): vscode.DataTransfer {
  const payload = uris.map((u) => u.toString()).join('\r\n');
  const dt = new vscode.DataTransfer();
  dt.set('text/uri-list', new vscode.DataTransferItem(payload));
  return dt;
}

const tokenSource = new vscode.CancellationTokenSource();
const pasteContext: vscode.DocumentPasteEditContext = {
  only: undefined,
  triggerKind: vscode.DocumentPasteTriggerKind.Automatic,
};

async function readText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return new TextDecoder().decode(bytes);
}

async function applyPaste(
  cfg: { newFileLocation?: string; newFileCustomPath?: string },
  document: vscode.TextDocument,
  sources: vscode.Uri[]
): Promise<vscode.DocumentPasteEdit | undefined> {
  const conf = vscode.workspace.getConfiguration('markdownLoom');
  const prevLoc = conf.get<string>('newFileLocation');
  const prevCustom = conf.get<string>('newFileCustomPath');
  await conf.update(
    'newFileLocation',
    cfg.newFileLocation ?? 'workspaceRoot',
    vscode.ConfigurationTarget.Workspace
  );
  await conf.update(
    'newFileCustomPath',
    cfg.newFileCustomPath ?? '',
    vscode.ConfigurationTarget.Workspace
  );
  try {
    const provider = new AttachmentPasteProvider();
    const result = await provider.provideDocumentPasteEdits(
      document,
      [new vscode.Range(0, 0, 0, 0)],
      makeUriListTransfer(sources),
      pasteContext,
      tokenSource.token
    );
    return result?.[0];
  } finally {
    await conf.update(
      'newFileLocation',
      prevLoc,
      vscode.ConfigurationTarget.Workspace
    );
    await conf.update(
      'newFileCustomPath',
      prevCustom,
      vscode.ConfigurationTarget.Workspace
    );
  }
}

suite('parseUriList', () => {
  test('parses CRLF-separated file URIs and skips comments/blanks', () => {
    const a = vscode.Uri.file('/tmp/a.pdf');
    const b = vscode.Uri.file('/tmp/b.pdf');
    const raw = `# header\r\n${a.toString()}\r\n\r\n${b.toString()}\r\n`;
    const parsed = parseUriList(raw);
    assert.deepStrictEqual(
      parsed.map((u) => u.fsPath),
      [a.fsPath, b.fsPath]
    );
  });
});

suite('allocateDestinationName', () => {
  const tempBase = uriFor('rootA', 'paste-alloc-tmp');

  setup(async () => {
    await tryDelete(tempBase);
    await vscode.workspace.fs.createDirectory(tempBase);
  });

  teardown(async () => {
    await tryDelete(tempBase);
  });

  test('returns the original name when nothing exists', async () => {
    const name = await allocateDestinationName(
      tempBase,
      'doc.pdf',
      new Set()
    );
    assert.strictEqual(name, 'doc.pdf');
  });

  test('suffixes -1, -2, ... on disk collisions', async () => {
    await writeTempFile(
      vscode.Uri.file(path.join(tempBase.fsPath, 'doc.pdf')),
      'x'
    );
    await writeTempFile(
      vscode.Uri.file(path.join(tempBase.fsPath, 'doc-1.pdf')),
      'x'
    );
    const name = await allocateDestinationName(
      tempBase,
      'doc.pdf',
      new Set()
    );
    assert.strictEqual(name, 'doc-2.pdf');
  });

  test('honors reserved names from earlier files in the same paste', async () => {
    const reserved = new Set<string>(['doc.pdf']);
    const name = await allocateDestinationName(
      tempBase,
      'doc.pdf',
      reserved
    );
    assert.strictEqual(name, 'doc-1.pdf');
  });

  test('preserves extension when suffixing', async () => {
    await writeTempFile(
      vscode.Uri.file(path.join(tempBase.fsPath, 'image.PNG')),
      'x'
    );
    const name = await allocateDestinationName(
      tempBase,
      'image.PNG',
      new Set()
    );
    assert.strictEqual(name, 'image-1.PNG');
  });

  test('handles extensionless filenames', async () => {
    await writeTempFile(
      vscode.Uri.file(path.join(tempBase.fsPath, 'README')),
      'x'
    );
    const name = await allocateDestinationName(
      tempBase,
      'README',
      new Set()
    );
    assert.strictEqual(name, 'README-1');
  });

  test('source-is-destination: returns original name (no -1 suffix)', async () => {
    const existing = vscode.Uri.file(path.join(tempBase.fsPath, 'logo.png'));
    await writeTempFile(existing, 'x');
    const name = await allocateDestinationName(
      tempBase,
      'logo.png',
      new Set(),
      existing
    );
    assert.strictEqual(name, 'logo.png');
  });

  test('source-is-destination is case-insensitive on macOS/Windows', async function () {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      this.skip();
      return;
    }
    const existing = path.join(tempBase.fsPath, 'Logo.png');
    await writeTempFile(vscode.Uri.file(existing), 'x');
    const name = await allocateDestinationName(
      tempBase,
      'Logo.png',
      new Set(),
      vscode.Uri.file(existing.toLowerCase())
    );
    assert.strictEqual(name, 'Logo.png');
  });
});

suite('AttachmentPasteProvider', () => {
  // Sources live outside the workspace fixtures so we don't pollute them.
  const sourceDir = uriFor('paste-src');
  const sourceA = vscode.Uri.file(path.join(sourceDir.fsPath, 'Some File.pdf'));
  const sourceB = vscode.Uri.file(path.join(sourceDir.fsPath, 'Another.pdf'));

  setup(async () => {
    await writeTempFile(sourceA, 'A-CONTENTS');
    await writeTempFile(sourceB, 'B-CONTENTS');
  });

  teardown(async () => {
    await tryDelete(sourceDir);
  });

  test('workspaceRoot: copies file to workspace root and inserts wikilink', async () => {
    const docUri = uriFor('rootA', 'folder', 'Nested.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const dest = uriFor('rootA', 'PasteTarget.pdf');
    const source = vscode.Uri.file(
      path.join(sourceDir.fsPath, 'PasteTarget.pdf')
    );
    await writeTempFile(source, 'TARGET');
    await tryDelete(dest);

    try {
      const edit = await applyPaste(
        { newFileLocation: 'workspaceRoot' },
        document,
        [source]
      );
      assert.ok(edit, 'expected an edit');
      assert.strictEqual(edit!.insertText, '[[PasteTarget.pdf]]');
      assert.strictEqual(edit!.title, 'Insert wikilink (Markdown Loom)');
      assert.ok(edit!.kind, 'expected edit.kind to be set so the chooser surfaces it');
      assert.ok(
        edit!.kind!.contains(WIKILINK_PASTE_EDIT_KIND),
        `expected kind to be (a sub-kind of) the wikilink paste edit kind, got "${edit!.kind!.value}"`
      );
      assert.strictEqual(await readText(dest), 'TARGET');
    } finally {
      await tryDelete(dest);
    }
  });

  test('returned edit declares title and wikilink kind so VS Code surfaces it in the paste chooser', async () => {
    // VS Code's paste chooser filters out edits without a title/kind, so
    // these structural fields are as important as insertText. Guarding
    // them in a dedicated test makes a regression here loudly obvious.
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const source = vscode.Uri.file(path.join(sourceDir.fsPath, 'TitleKind.pdf'));
    await writeTempFile(source, 'TK');
    const dest = uriFor('rootA', 'TitleKind.pdf');
    await tryDelete(dest);

    try {
      const edit = await applyPaste(
        { newFileLocation: 'workspaceRoot' },
        document,
        [source]
      );
      assert.ok(edit);
      assert.ok(
        typeof edit!.title === 'string' && edit!.title.length > 0,
        'title must be non-empty'
      );
      assert.ok(edit!.kind, 'kind must be set');
      assert.ok(
        edit!.kind!.value.split('.').includes('wikilink'),
        `kind path must include "wikilink", got "${edit!.kind!.value}"`
      );
    } finally {
      await tryDelete(dest);
    }
  });

  test('multi-file paste uses the plural title', async () => {
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const s1 = vscode.Uri.file(path.join(sourceDir.fsPath, 'MultiA.pdf'));
    const s2 = vscode.Uri.file(path.join(sourceDir.fsPath, 'MultiB.pdf'));
    await writeTempFile(s1, '1');
    await writeTempFile(s2, '2');
    const dest1 = uriFor('rootA', 'MultiA.pdf');
    const dest2 = uriFor('rootA', 'MultiB.pdf');
    await tryDelete(dest1);
    await tryDelete(dest2);

    try {
      const edit = await applyPaste(
        { newFileLocation: 'workspaceRoot' },
        document,
        [s1, s2]
      );
      assert.ok(edit);
      assert.strictEqual(edit!.title, 'Insert wikilinks (Markdown Loom)');
    } finally {
      await tryDelete(dest1);
      await tryDelete(dest2);
    }
  });

  test('source already at the destination: no copy, no -1 suffix, links to existing file', async () => {
    // User pastes a file that already lives at the resolved destination.
    // Expected: no new file is written, the inserted wikilink uses the
    // source's existing basename, and no `-1`-suffixed copy is created.
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const existing = uriFor('rootA', 'AlreadyHere.png');
    const dashOne = uriFor('rootA', 'AlreadyHere-1.png');
    await writeTempFile(existing, 'ORIGINAL');
    await tryDelete(dashOne);

    try {
      const edit = await applyPaste(
        { newFileLocation: 'workspaceRoot' },
        document,
        [existing]
      );
      assert.ok(edit);
      assert.strictEqual(edit!.insertText, '[[AlreadyHere.png]]');
      // Original is untouched.
      assert.strictEqual(await readText(existing), 'ORIGINAL');
      // No spurious -1 copy.
      await assert.rejects(async () => {
        await vscode.workspace.fs.stat(dashOne);
      }, 'expected no -1 duplicate to be created');
    } finally {
      await tryDelete(existing);
      await tryDelete(dashOne);
    }
  });

  test('source elsewhere in the workspace with the same basename does suffix', async () => {
    // A real collision: source file exists in a subfolder, an unrelated
    // file with the same basename exists at the destination. We must
    // still suffix; only the source-is-dest case is exempt.
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const sourceSub = uriFor('rootA', 'folder', 'shared-name.png');
    const existingAtDest = uriFor('rootA', 'shared-name.png');
    const dashOne = uriFor('rootA', 'shared-name-1.png');
    await writeTempFile(sourceSub, 'SUB');
    await writeTempFile(existingAtDest, 'AT-DEST');
    await tryDelete(dashOne);

    try {
      const edit = await applyPaste(
        { newFileLocation: 'workspaceRoot' },
        document,
        [sourceSub]
      );
      assert.ok(edit);
      assert.strictEqual(edit!.insertText, '[[shared-name-1.png]]');
      assert.strictEqual(await readText(existingAtDest), 'AT-DEST');
      assert.strictEqual(await readText(dashOne), 'SUB');
    } finally {
      await tryDelete(sourceSub);
      await tryDelete(existingAtDest);
      await tryDelete(dashOne);
    }
  });

  test('sameFolderAsActive: copies next to the source note', async () => {
    const docUri = uriFor('rootA', 'folder', 'Nested.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const dest = uriFor('rootA', 'folder', 'SameFolder.pdf');
    const source = vscode.Uri.file(
      path.join(sourceDir.fsPath, 'SameFolder.pdf')
    );
    await writeTempFile(source, 'SAME');
    await tryDelete(dest);

    try {
      const edit = await applyPaste(
        { newFileLocation: 'sameFolderAsActive' },
        document,
        [source]
      );
      assert.ok(edit);
      assert.strictEqual(edit!.insertText, '[[SameFolder.pdf]]');
      assert.strictEqual(await readText(dest), 'SAME');
    } finally {
      await tryDelete(dest);
    }
  });

  test('customPath: creates intermediates under the source workspace folder', async () => {
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const dest = uriFor('rootA', 'attachments', 'nested', 'CustomPaste.pdf');
    const intermediate = uriFor('rootA', 'attachments');
    const source = vscode.Uri.file(
      path.join(sourceDir.fsPath, 'CustomPaste.pdf')
    );
    await writeTempFile(source, 'CUSTOM');
    await tryDelete(intermediate);

    try {
      const edit = await applyPaste(
        {
          newFileLocation: 'customPath',
          newFileCustomPath: path.join('attachments', 'nested'),
        },
        document,
        [source]
      );
      assert.ok(edit);
      assert.strictEqual(edit!.insertText, '[[CustomPaste.pdf]]');
      assert.strictEqual(await readText(dest), 'CUSTOM');
    } finally {
      await tryDelete(intermediate);
    }
  });

  test('collision: never overwrites and inserts the suffixed basename', async () => {
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    // rootA already contains a fixture file named "Some File.pdf"; reuse it
    // as the on-disk obstacle and write a sentinel to a second collision
    // slot to force -2.
    const existingOriginal = uriFor('rootA', 'Some File.pdf');
    const dashOne = uriFor('rootA', 'Some File-1.pdf');
    const dashTwo = uriFor('rootA', 'Some File-2.pdf');
    await writeTempFile(dashOne, 'EXISTING-1');
    await tryDelete(dashTwo);

    try {
      const edit = await applyPaste(
        { newFileLocation: 'workspaceRoot' },
        document,
        [sourceA]
      );
      assert.ok(edit);
      assert.strictEqual(edit!.insertText, '[[Some File-2.pdf]]');
      assert.strictEqual(await readText(dashTwo), 'A-CONTENTS');
      // Pre-existing files are untouched.
      const existingBytes = await vscode.workspace.fs.stat(existingOriginal);
      assert.strictEqual(existingBytes.type, vscode.FileType.File);
      assert.strictEqual(await readText(dashOne), 'EXISTING-1');
    } finally {
      await tryDelete(dashOne);
      await tryDelete(dashTwo);
    }
  });

  test('multi-file paste: one wikilink per line; intra-paste collisions suffix', async () => {
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    // Two distinct sources with the same basename force an intra-paste
    // collision even when nothing exists on disk.
    const dupA = vscode.Uri.file(path.join(sourceDir.fsPath, 'dirA', 'Notes 2.pdf'));
    const dupB = vscode.Uri.file(path.join(sourceDir.fsPath, 'dirB', 'Notes 2.pdf'));
    await writeTempFile(dupA, 'A');
    await writeTempFile(dupB, 'B');
    const destA = uriFor('rootA', 'Notes 2.pdf');
    const destB = uriFor('rootA', 'Notes 2-1.pdf');
    await tryDelete(destA);
    await tryDelete(destB);

    try {
      const edit = await applyPaste(
        { newFileLocation: 'workspaceRoot' },
        document,
        [dupA, dupB]
      );
      assert.ok(edit);
      assert.strictEqual(edit!.insertText, '[[Notes 2.pdf]]\n[[Notes 2-1.pdf]]');
      assert.strictEqual(await readText(destA), 'A');
      assert.strictEqual(await readText(destB), 'B');
    } finally {
      await tryDelete(destA);
      await tryDelete(destB);
    }
  });

  test('multi-root: customPath resolves against the source-note workspace folder', async () => {
    const docUri = uriFor('rootB', 'Sibling.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const source = vscode.Uri.file(path.join(sourceDir.fsPath, 'MultiRoot.pdf'));
    await writeTempFile(source, 'MR');
    const dest = uriFor('rootB', 'inbox', 'MultiRoot.pdf');
    const intermediate = uriFor('rootB', 'inbox');
    const notExpected = uriFor('rootA', 'inbox', 'MultiRoot.pdf');
    await tryDelete(intermediate);
    await tryDelete(uriFor('rootA', 'inbox'));

    try {
      const edit = await applyPaste(
        { newFileLocation: 'customPath', newFileCustomPath: 'inbox' },
        document,
        [source]
      );
      assert.ok(edit);
      assert.strictEqual(edit!.insertText, '[[MultiRoot.pdf]]');
      assert.strictEqual(await readText(dest), 'MR');
      await assert.rejects(async () => {
        await vscode.workspace.fs.stat(notExpected);
      });
    } finally {
      await tryDelete(intermediate);
      await tryDelete(uriFor('rootA', 'inbox'));
    }
  });

  test('non-file payload (URL only) falls through', async () => {
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const dt = new vscode.DataTransfer();
    dt.set(
      'text/uri-list',
      new vscode.DataTransferItem('https://example.com/page')
    );

    const provider = new AttachmentPasteProvider();
    const result = await provider.provideDocumentPasteEdits(
      document,
      [new vscode.Range(0, 0, 0, 0)],
      dt,
      pasteContext,
      tokenSource.token
    );
    assert.strictEqual(result, undefined);
  });

  test('no file mime data falls through', async () => {
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const dt = new vscode.DataTransfer();
    dt.set('text/plain', new vscode.DataTransferItem('hello'));

    const provider = new AttachmentPasteProvider();
    const result = await provider.provideDocumentPasteEdits(
      document,
      [new vscode.Range(0, 0, 0, 0)],
      dt,
      pasteContext,
      tokenSource.token
    );
    assert.strictEqual(result, undefined);
  });

  test('document outside any workspace folder falls through', async () => {
    // Construct an untitled document; getWorkspaceFolder returns undefined
    // for untitled URIs that aren't inside an open workspace folder path.
    const document = await vscode.workspace.openTextDocument({
      content: 'x',
      language: 'markdown',
    });
    if (vscode.workspace.getWorkspaceFolder(document.uri)) {
      // Some test hosts attach untitled docs to a workspace folder; skip.
      return;
    }
    const source = vscode.Uri.file(path.join(sourceDir.fsPath, 'Outside.pdf'));
    await writeTempFile(source, 'O');

    const provider = new AttachmentPasteProvider();
    const result = await provider.provideDocumentPasteEdits(
      document,
      [new vscode.Range(0, 0, 0, 0)],
      makeUriListTransfer([source]),
      pasteContext,
      tokenSource.token
    );
    assert.strictEqual(result, undefined);
  });

  test('disabled via setting: falls through', async () => {
    const conf = vscode.workspace.getConfiguration('markdownLoom');
    const prev = conf.get<boolean>('attachments.paste.enabled');
    await conf.update(
      'attachments.paste.enabled',
      false,
      vscode.ConfigurationTarget.Workspace
    );
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const source = vscode.Uri.file(path.join(sourceDir.fsPath, 'Disabled.pdf'));
    await writeTempFile(source, 'D');
    const dest = uriFor('rootA', 'Disabled.pdf');
    await tryDelete(dest);

    try {
      const provider = new AttachmentPasteProvider();
      const result = await provider.provideDocumentPasteEdits(
        document,
        [new vscode.Range(0, 0, 0, 0)],
        makeUriListTransfer([source]),
        pasteContext,
        tokenSource.token
      );
      assert.strictEqual(result, undefined);
      // Nothing copied.
      await assert.rejects(async () => {
        await vscode.workspace.fs.stat(dest);
      });
    } finally {
      await conf.update(
        'attachments.paste.enabled',
        prev,
        vscode.ConfigurationTarget.Workspace
      );
      await tryDelete(dest);
    }
  });

  test('cross-scheme source (e.g. vscode-local in a remote window) is copied into the workspace', async () => {
    // Regression for the Dev Container case: a file pasted from the host
    // arrives on a non-file scheme (vscode-local) while the workspace is
    // file:. The provider must read the source across schemes and write
    // it into the workspace rather than dropping it. We stand in an
    // in-memory provider for the foreign scheme.
    const registration = vscode.workspace.registerFileSystemProvider(
      'loomtest',
      new InMemoryFileSystemProvider(),
      { isReadonly: true, isCaseSensitive: true }
    );
    const remoteSource = vscode.Uri.parse('loomtest:/Downloads/Remote File.pdf');
    InMemoryFileSystemProvider.seed(
      remoteSource,
      new TextEncoder().encode('REMOTE-BYTES')
    );
    const docUri = uriFor('rootA', 'Index.md');
    const document = await vscode.workspace.openTextDocument(docUri);
    const dest = uriFor('rootA', 'Remote File.pdf');
    await tryDelete(dest);

    try {
      const edit = await applyPaste(
        { newFileLocation: 'workspaceRoot' },
        document,
        [remoteSource]
      );
      assert.ok(edit, 'expected an edit for a cross-scheme source');
      assert.strictEqual(edit!.insertText, '[[Remote File.pdf]]');
      // The bytes were read across schemes and written into the workspace.
      assert.strictEqual(await readText(dest), 'REMOTE-BYTES');
    } finally {
      registration.dispose();
      await tryDelete(dest);
    }
  });
});

/**
 * Minimal in-memory read-only filesystem provider used to stand in for a
 * foreign scheme (like `vscode-local:` in a remote window) so the
 * cross-scheme copy path can be exercised in tests.
 */
class InMemoryFileSystemProvider implements vscode.FileSystemProvider {
  private static store = new Map<string, Uint8Array>();

  static seed(uri: vscode.Uri, data: Uint8Array): void {
    InMemoryFileSystemProvider.store.set(uri.path, data);
  }

  private readonly emitter =
    new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const data = InMemoryFileSystemProvider.store.get(uri.path);
    if (!data) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return {
      type: vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: data.byteLength,
    };
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const data = InMemoryFileSystemProvider.store.get(uri.path);
    if (!data) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return data;
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(): void {
    // no-op
  }

  writeFile(): void {
    throw vscode.FileSystemError.NoPermissions('read-only');
  }

  delete(): void {
    throw vscode.FileSystemError.NoPermissions('read-only');
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions('read-only');
  }
}
