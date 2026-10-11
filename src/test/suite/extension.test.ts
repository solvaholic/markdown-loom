import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const extensionId = 'solvaholic.markdown-loom';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension(extensionId));
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension(extensionId);
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test('Extension should expose Marketplace discovery and support metadata', () => {
    const ext = vscode.extensions.getExtension(extensionId);
    assert.ok(ext);
    assert.strictEqual(ext.packageJSON.publisher, 'solvaholic');
    assert.deepStrictEqual(ext.packageJSON.keywords, [
      'markdown',
      'wikilinks',
      'backlinks',
      'notes',
      'knowledge-base',
      'obsidian',
      'zettelkasten',
      'wiki',
      'note-taking',
      'attachments',
    ]);
    assert.strictEqual(
      ext.packageJSON.qna,
      'https://github.com/solvaholic/markdown-loom/issues/new?template=question.yml',
    );
    assert.strictEqual(ext.packageJSON.bugs.url, 'https://github.com/solvaholic/markdown-loom/issues');
  });

  test('Extension icon should reference the project 256x256 PNG', () => {
    const ext = vscode.extensions.getExtension(extensionId);
    assert.ok(ext);
    assert.strictEqual(ext.packageJSON.icon, 'media/logo.png');

    const icon = readFileSync(path.join(ext.extensionPath, 'media/logo.png'));
    assert.deepStrictEqual(icon.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.strictEqual(icon.toString('ascii', 12, 16), 'IHDR');
    assert.strictEqual(icon.readUInt32BE(16), 256);
    assert.strictEqual(icon.readUInt32BE(20), 256);
  });
});
