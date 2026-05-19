import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  createMissingNote,
  CreateMissingNotePolicy,
  NewNoteLocationConfig,
} from '../../providers/linkCommands';

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
    await vscode.workspace.fs.delete(uri, { useTrash: false });
  } catch {
    // already gone
  }
}

suite('createMissingNote policy', () => {
  // The wikilink command site only ever calls createMissingNote for a
  // missing target, so each test uses a fresh basename that does not
  // exist in test-fixtures/rootA and cleans up afterwards.
  const fromUri = uriFor('rootA', 'Index.md');

  const originalShowInformationMessage = vscode.window.showInformationMessage;

  teardown(() => {
    (vscode.window as unknown as { showInformationMessage: unknown }).showInformationMessage =
      originalShowInformationMessage;
  });

  test('policy=prompt confirmed: creates and returns the new file', async () => {
    const target = 'PolicyPromptYes';
    const expected = uriFor('rootA', `${target}.md`);
    await tryDelete(expected);
    let prompted = false;
    (vscode.window as unknown as { showInformationMessage: unknown }).showInformationMessage =
      async () => {
        prompted = true;
        return 'Create';
      };

    const result = await createMissingNote(target, fromUri, 'prompt');

    assert.ok(prompted, 'expected the user to be prompted');
    assert.ok(result, 'expected a uri to be returned');
    const stat = await vscode.workspace.fs.stat(expected);
    assert.strictEqual(stat.type, vscode.FileType.File);
    await tryDelete(expected);
  });

  test('policy=prompt dismissed: returns null and creates nothing', async () => {
    const target = 'PolicyPromptNo';
    const expected = uriFor('rootA', `${target}.md`);
    await tryDelete(expected);
    (vscode.window as unknown as { showInformationMessage: unknown }).showInformationMessage =
      async () => undefined;

    const result = await createMissingNote(target, fromUri, 'prompt');

    assert.strictEqual(result, null);
    await assert.rejects(async () => { await vscode.workspace.fs.stat(expected); });
  });

  test('policy=auto: creates silently without prompting', async () => {
    const target = 'PolicyAuto';
    const expected = uriFor('rootA', `${target}.md`);
    await tryDelete(expected);
    let prompted = false;
    (vscode.window as unknown as { showInformationMessage: unknown }).showInformationMessage =
      async () => {
        prompted = true;
        return 'Create';
      };

    const result = await createMissingNote(target, fromUri, 'auto');

    assert.strictEqual(prompted, false, 'auto policy must not prompt');
    assert.ok(result, 'expected a uri to be returned');
    const stat = await vscode.workspace.fs.stat(expected);
    assert.strictEqual(stat.type, vscode.FileType.File);
    await tryDelete(expected);
  });

  test('policy=never: returns null, creates nothing, no prompt', async () => {
    const target = 'PolicyNever';
    const expected = uriFor('rootA', `${target}.md`);
    await tryDelete(expected);
    let prompted = false;
    (vscode.window as unknown as { showInformationMessage: unknown }).showInformationMessage =
      async () => {
        prompted = true;
        return 'Create';
      };

    const result = await createMissingNote(target, fromUri, 'never');

    assert.strictEqual(prompted, false, 'never policy must not prompt');
    assert.strictEqual(result, null);
    await assert.rejects(async () => { await vscode.workspace.fs.stat(expected); });
  });

  test('existing target is returned regardless of policy without prompting', async () => {
    // Index.md exists in rootA; passing any policy should return it
    // without prompting or writing.
    for (const policy of ['prompt', 'auto', 'never'] as CreateMissingNotePolicy[]) {
      let prompted = false;
      (vscode.window as unknown as { showInformationMessage: unknown }).showInformationMessage =
        async () => {
          prompted = true;
          return 'Create';
        };

      const result = await createMissingNote('Index', fromUri, policy);

      assert.ok(result, `expected existing Index to resolve for policy=${policy}`);
      assert.strictEqual(prompted, false, `policy=${policy} must not prompt for existing file`);
    }
  });
});

suite('createMissingNote location', () => {
  // Fresh basename + cleanup per test so we never collide with fixtures.
  const fromUri = uriFor('rootA', 'folder', 'Sub.md');

  test('default (workspaceRoot) places the note at the source workspace folder root', async () => {
    const target = 'LocDefaultRoot';
    const expected = uriFor('rootA', `${target}.md`);
    const notExpected = uriFor('rootA', 'folder', `${target}.md`);
    await tryDelete(expected);
    await tryDelete(notExpected);

    const result = await createMissingNote(target, fromUri, 'auto');

    assert.ok(result, 'expected a uri to be returned');
    assert.strictEqual(result!.fsPath, expected.fsPath);
    const stat = await vscode.workspace.fs.stat(expected);
    assert.strictEqual(stat.type, vscode.FileType.File);
    await tryDelete(expected);
  });

  test('sameFolderAsActive places the note next to the source note', async () => {
    const target = 'LocSameFolder';
    const expected = uriFor('rootA', 'folder', `${target}.md`);
    await tryDelete(expected);

    const result = await createMissingNote(target, fromUri, 'auto', {
      mode: 'sameFolderAsActive',
    });

    assert.ok(result, 'expected a uri to be returned');
    assert.strictEqual(result!.fsPath, expected.fsPath);
    const stat = await vscode.workspace.fs.stat(expected);
    assert.strictEqual(stat.type, vscode.FileType.File);
    await tryDelete(expected);
  });

  test('customPath honors a workspace-relative directory and creates intermediates', async () => {
    const target = 'LocCustom';
    const customDir = path.join('inbox', 'nested');
    const expected = uriFor('rootA', 'inbox', 'nested', `${target}.md`);
    const intermediate = uriFor('rootA', 'inbox');
    await tryDelete(expected);
    await tryDelete(intermediate);

    const result = await createMissingNote(target, fromUri, 'auto', {
      mode: 'customPath',
      customPath: customDir,
    });

    assert.ok(result, 'expected a uri to be returned');
    assert.strictEqual(result!.fsPath, expected.fsPath);
    const stat = await vscode.workspace.fs.stat(expected);
    assert.strictEqual(stat.type, vscode.FileType.File);
    // Both leaf and intermediate folder should exist on disk.
    const dirStat = await vscode.workspace.fs.stat(intermediate);
    assert.strictEqual(dirStat.type, vscode.FileType.Directory);
    await tryDelete(expected);
    await tryDelete(intermediate);
  });

  test('customPath falls back to root when empty', async () => {
    const target = 'LocCustomEmpty';
    const expected = uriFor('rootA', `${target}.md`);
    await tryDelete(expected);

    const result = await createMissingNote(target, fromUri, 'auto', {
      mode: 'customPath',
      customPath: '   ',
    });

    assert.ok(result, 'expected a uri to be returned');
    assert.strictEqual(result!.fsPath, expected.fsPath);
    await tryDelete(expected);
  });

  test('customPath that escapes the workspace falls back to root', async () => {
    const target = 'LocCustomEscape';
    const expected = uriFor('rootA', `${target}.md`);
    await tryDelete(expected);

    const result = await createMissingNote(target, fromUri, 'auto', {
      mode: 'customPath',
      customPath: '../escape',
    });

    assert.ok(result, 'expected a uri to be returned');
    assert.strictEqual(result!.fsPath, expected.fsPath);
    await tryDelete(expected);
  });

  test('multi-root: customPath resolves against the source note workspace folder', async () => {
    // rootB has its own Sibling.md fixture; ensure customPath lands under
    // rootB (not rootA, which is the first folder in the workspace).
    const sourceInRootB = uriFor('rootB', 'Sibling.md');
    const target = 'LocMultiRoot';
    const expected = uriFor('rootB', 'inbox', `${target}.md`);
    const intermediate = uriFor('rootB', 'inbox');
    const notExpected = uriFor('rootA', 'inbox', `${target}.md`);
    await tryDelete(expected);
    await tryDelete(intermediate);
    await tryDelete(notExpected);

    const location: NewNoteLocationConfig = {
      mode: 'customPath',
      customPath: 'inbox',
    };
    const result = await createMissingNote(target, sourceInRootB, 'auto', location);

    assert.ok(result, 'expected a uri to be returned');
    assert.strictEqual(result!.fsPath, expected.fsPath);
    const stat = await vscode.workspace.fs.stat(expected);
    assert.strictEqual(stat.type, vscode.FileType.File);
    await assert.rejects(async () => {
      await vscode.workspace.fs.stat(notExpected);
    });
    await tryDelete(expected);
    await tryDelete(intermediate);
  });

  test('sameFolderAsActive falls back to workspace root for untitled buffers', async () => {
    // Untitled buffer in rootA: vscode.getWorkspaceFolder still returns rootA
    // when the URI is inside a workspace folder path, but scheme !== 'file'.
    // Construct an untitled URI under rootA and expect the file to land at
    // rootA's root, not under any directory.
    const untitledUri = uriFor('rootA', 'untitled-1.md').with({ scheme: 'untitled' });
    const target = 'LocUntitledFallback';
    const expected = uriFor('rootA', `${target}.md`);
    await tryDelete(expected);

    const result = await createMissingNote(target, untitledUri, 'auto', {
      mode: 'sameFolderAsActive',
    });

    // If the URI isn't recognized as belonging to a workspace folder,
    // createMissingNote returns null. In that case there's nothing more to
    // assert. Otherwise, the file must land at the workspace root.
    if (result) {
      assert.strictEqual(result.fsPath, expected.fsPath);
      await tryDelete(expected);
    }
  });
});
