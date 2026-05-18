import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  createMissingNote,
  CreateMissingNotePolicy,
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
