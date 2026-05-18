import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { NoteIndex } from '../../index/noteIndex';
import { BacklinksProvider } from '../../providers/backlinksProvider';

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

suite('BacklinksProvider — attachment editor', () => {
  let index: NoteIndex;
  let provider: BacklinksProvider;

  suiteSetup(async () => {
    index = new NoteIndex();
    await index.ready();
    provider = new BacklinksProvider(index);
    // Dismiss any previously active editor so the panel starts in a known state.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(200);
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    provider.dispose();
    index.dispose();
  });

  test('panel shows backlinks when the active editor is an indexed attachment', async () => {
    // rootA/Index.md contains [[Some File.pdf]], so rootA/Some File.pdf has
    // at least one backlink. Open the attachment as the active editor and
    // confirm the panel surfaces it — previously the languageId !== 'markdown'
    // gate dropped the refresh and the panel rendered empty.
    const pdfUri = uriFor('rootA', 'Some File.pdf');
    const doc = await vscode.workspace.openTextDocument(pdfUri);
    await vscode.window.showTextDocument(doc);

    // Wait for active-editor change event + debounce to settle.
    await sleep(300);

    const [rootNode] = provider.getChildren();
    assert.ok(rootNode, 'expected a root node');
    assert.strictEqual(rootNode.kind, 'root');
    assert.ok(
      rootNode.count > 0,
      'expected at least one backlink for the PDF attachment editor'
    );
  });

  test('panel stays empty for a non-vault file', async () => {
    // package.json is a real file on disk but is not indexed as a note or
    // attachment — the panel must not react to it.
    // The repo root is one level above the test-fixtures directory.
    const repoRoot = path.resolve(fixturePath(), '..');
    const pkgUri = vscode.Uri.file(path.join(repoRoot, 'package.json'));
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(pkgUri);
    } catch {
      // If the file doesn't exist in this environment, skip gracefully.
      return;
    }
    await vscode.window.showTextDocument(doc);
    await sleep(300);

    const [rootNode] = provider.getChildren();
    assert.ok(rootNode, 'expected a root node');
    assert.strictEqual(rootNode.kind, 'root');
    assert.strictEqual(rootNode.count, 0, 'panel must show 0 backlinks for a non-vault file');
  });
});

