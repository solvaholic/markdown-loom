import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

function fixturePath(...parts: string[]): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = folders[0]?.uri.fsPath ?? '';
  return path.join(path.dirname(root), ...parts);
}

function uriFor(...parts: string[]): vscode.Uri {
  return vscode.Uri.file(fixturePath(...parts));
}

/**
 * Helper: write a file, open it as a document (so VS Code indexes it), then
 * return its URI. Caller is responsible for cleanup.
 */
async function writeFixture(
  relativeParts: string[],
  content: string
): Promise<vscode.Uri> {
  const uri = uriFor(...relativeParts);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
  // Opening the document triggers onDidSaveTextDocument indexing and ensures
  // VS Code is aware of the file before we attempt a rename.
  const doc = await vscode.workspace.openTextDocument(uri);
  await doc.save();
  // Give the file watcher and index time to process.
  await sleep(500);
  return uri;
}

async function readText(uri: vscode.Uri): Promise<string> {
  // Prefer the in-memory document buffer (edits from onWillRenameFiles may not
  // be flushed to disk yet).
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    return doc.getText();
  } catch {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function deleteIfExists(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri);
  } catch {
    // ignore
  }
}

suite('Link rewrite on file rename', () => {
  // Temp files created during tests — cleaned up in suiteTeardown.
  const tempFiles: vscode.Uri[] = [];

  suiteTeardown(async () => {
    for (const uri of tempFiles) {
      await deleteIfExists(uri);
    }
  });

  test('basic rename rewrites [[OldName]] to [[NewName]]', async () => {
    const sourceUri = await writeFixture(
      ['rootA', '_test_rename_source.md'],
      'See [[_test_rename_target]] for details.\n'
    );
    tempFiles.push(sourceUri);

    const targetUri = await writeFixture(
      ['rootA', '_test_rename_target.md'],
      '# Target\n'
    );
    // We'll rename target → _test_rename_new.md
    const newTargetUri = uriFor('rootA', '_test_rename_new.md');
    tempFiles.push(newTargetUri);
    // targetUri will be gone after rename, but just in case:
    tempFiles.push(targetUri);

    // Give index time to settle.
    await sleep(500);

    // Perform the rename via WorkspaceEdit (triggers onWillRenameFiles).
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(targetUri, newTargetUri);
    const applied = await vscode.workspace.applyEdit(edit);
    assert.ok(applied, 'applyEdit should succeed');

    // Wait for edits to flush.
    await sleep(500);

    const sourceContent = await readText(sourceUri);
    assert.ok(
      sourceContent.includes('[[_test_rename_new]]'),
      `expected [[_test_rename_new]] in source, got: ${sourceContent}`
    );
    assert.ok(
      !sourceContent.includes('[[_test_rename_target]]'),
      `old link should be gone, got: ${sourceContent}`
    );
  });

  test('case-insensitive match: [[oldname]] is rewritten', async () => {
    const sourceUri = await writeFixture(
      ['rootA', '_test_ci_source.md'],
      'Link: [[_test_ci_old]]\n'
    );
    tempFiles.push(sourceUri);

    const targetUri = await writeFixture(
      ['rootA', '_test_CI_old.md'],
      '# CI target\n'
    );
    const newUri = uriFor('rootA', '_test_CI_New.md');
    tempFiles.push(newUri);
    tempFiles.push(targetUri);

    await sleep(500);

    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(targetUri, newUri);
    const applied = await vscode.workspace.applyEdit(edit);
    assert.ok(applied);

    await sleep(500);

    const content = await readText(sourceUri);
    assert.ok(
      content.includes('[[_test_CI_New]]'),
      `expected [[_test_CI_New]], got: ${content}`
    );
  });

  test('section ref is preserved: [[Note#Heading]] → [[New#Heading]]', async () => {
    const sourceUri = await writeFixture(
      ['rootA', '_test_sec_source.md'],
      'See [[_test_sec_old#Details]] for info.\n'
    );
    tempFiles.push(sourceUri);

    const targetUri = await writeFixture(
      ['rootA', '_test_sec_old.md'],
      '# Title\n\n## Details\n'
    );
    const newUri = uriFor('rootA', '_test_sec_new.md');
    tempFiles.push(newUri);
    tempFiles.push(targetUri);

    await sleep(500);

    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(targetUri, newUri);
    await vscode.workspace.applyEdit(edit);

    await sleep(500);

    const content = await readText(sourceUri);
    assert.ok(
      content.includes('[[_test_sec_new#Details]]'),
      `expected section preserved, got: ${content}`
    );
  });

  test('alias is preserved: [[Note|Alias]] → [[New|Alias]]', async () => {
    const sourceUri = await writeFixture(
      ['rootA', '_test_alias_source.md'],
      'See [[_test_alias_old|My Alias]] here.\n'
    );
    tempFiles.push(sourceUri);

    const targetUri = await writeFixture(
      ['rootA', '_test_alias_old.md'],
      '# Alias target\n'
    );
    const newUri = uriFor('rootA', '_test_alias_new.md');
    tempFiles.push(newUri);
    tempFiles.push(targetUri);

    await sleep(500);

    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(targetUri, newUri);
    await vscode.workspace.applyEdit(edit);

    await sleep(500);

    const content = await readText(sourceUri);
    assert.ok(
      content.includes('[[_test_alias_new|My Alias]]'),
      `expected alias preserved, got: ${content}`
    );
  });

  test('section + alias preserved: [[Note#H|A]] → [[New#H|A]]', async () => {
    const sourceUri = await writeFixture(
      ['rootA', '_test_both_source.md'],
      'Link: [[_test_both_old#Heading|Display]]\n'
    );
    tempFiles.push(sourceUri);

    const targetUri = await writeFixture(
      ['rootA', '_test_both_old.md'],
      '# Title\n\n## Heading\n'
    );
    const newUri = uriFor('rootA', '_test_both_new.md');
    tempFiles.push(newUri);
    tempFiles.push(targetUri);

    await sleep(500);

    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(targetUri, newUri);
    await vscode.workspace.applyEdit(edit);

    await sleep(500);

    const content = await readText(sourceUri);
    assert.ok(
      content.includes('[[_test_both_new#Heading|Display]]'),
      `expected both preserved, got: ${content}`
    );
  });

  test('non-markdown rename is ignored', async () => {
    const mdSource = await writeFixture(
      ['rootA', '_test_nomd_source.md'],
      'Unrelated [[_test_nomd_source]] content.\n'
    );
    tempFiles.push(mdSource);

    // Create a .txt file and rename it — should not affect anything.
    const txtUri = uriFor('rootA', '_test_nomd.txt');
    await vscode.workspace.fs.writeFile(txtUri, Buffer.from('hello', 'utf-8'));
    const newTxtUri = uriFor('rootA', '_test_nomd_renamed.txt');
    tempFiles.push(txtUri);
    tempFiles.push(newTxtUri);

    await sleep(300);

    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(txtUri, newTxtUri);
    await vscode.workspace.applyEdit(edit);

    await sleep(300);

    const content = await readText(mdSource);
    assert.ok(
      content.includes('[[_test_nomd_source]]'),
      `markdown content should be unchanged, got: ${content}`
    );
  });
});
