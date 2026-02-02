import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('markdown-loom.markdown-loom'));
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('markdown-loom.markdown-loom');
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });
});
