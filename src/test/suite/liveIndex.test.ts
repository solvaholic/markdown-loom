import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { NoteIndex } from '../../index/noteIndex';

function fixturePath(...parts: string[]): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = folders[0]?.uri.fsPath ?? '';
  return path.join(path.dirname(root), ...parts);
}

function uriFor(...parts: string[]): vscode.Uri {
  return vscode.Uri.file(fixturePath(...parts));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Comfortably longer than the index's live-change debounce so re-indexing
// has settled before we assert.
const SETTLE_MS = 500;

suite('NoteIndex — unsaved (dirty) buffer indexing', () => {
  let index: NoteIndex;

  suiteSetup(async () => {
    index = new NoteIndex();
    await index.ready();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(200);
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    index.dispose();
  });

  test('a wikilink typed in an unsaved buffer appears in backlinks before save', async () => {
    const blocksUri = uriFor('rootA', 'Blocks.md');
    const sourceUri = uriFor('rootA', 'Broken.md');

    // Baseline: nothing in the fixtures links to Blocks.md.
    assert.strictEqual(
      index.getBacklinks(blocksUri).length,
      0,
      'expected Blocks.md to start with no backlinks'
    );

    const doc = await vscode.workspace.openTextDocument(sourceUri);
    await vscode.window.showTextDocument(doc);

    // Insert a wikilink at the very top of the buffer (outside any fence) and
    // do NOT save — the edit lives only in the editor buffer.
    const edit = new vscode.WorkspaceEdit();
    edit.insert(sourceUri, new vscode.Position(0, 0), '[[Blocks]]\n');
    const applied = await vscode.workspace.applyEdit(edit);
    assert.ok(applied, 'expected the buffer edit to apply');
    assert.ok(doc.isDirty, 'expected the document to be dirty (unsaved)');

    await sleep(SETTLE_MS);

    const backlinks = index.getBacklinks(blocksUri);
    assert.strictEqual(
      backlinks.length,
      1,
      'expected exactly one backlink to Blocks.md from the unsaved edit'
    );
    assert.ok(
      backlinks[0].sourceUri.fsPath.endsWith(`${path.sep}Broken.md`),
      'expected the backlink source to be Broken.md'
    );

    // Abandon the edit: reverting restores the on-disk content, so the phantom
    // backlink must disappear again.
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await sleep(SETTLE_MS);

    assert.strictEqual(
      index.getBacklinks(blocksUri).length,
      0,
      'expected the backlink to be gone after reverting the unsaved edit'
    );
  });
});
