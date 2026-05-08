import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { NoteIndex } from '../../index/noteIndex';
import { WikiLinkDocumentLinkProvider } from '../../providers/linkDocumentLinkProvider';

function fixturePath(...parts: string[]): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = folders[0]?.uri.fsPath ?? '';
  return path.join(path.dirname(root), ...parts);
}

function uriFor(...parts: string[]): vscode.Uri {
  return vscode.Uri.file(fixturePath(...parts));
}

suite('WikiLinkDocumentLinkProvider (alias coverage for #6)', () => {
  let index: NoteIndex;
  let provider: WikiLinkDocumentLinkProvider;

  suiteSetup(async () => {
    index = new NoteIndex();
    await index.ready();
    provider = new WikiLinkDocumentLinkProvider(index);
  });

  suiteTeardown(() => {
    index.dispose();
  });

  test('aliased link to existing note resolves to a file: URI ending in target.md', async () => {
    // rootA/Index.md contains `[[Foo|RootB Foo]]`. The same-root tiebreaker
    // means it should resolve to rootA/Foo.md, not rootB/Foo.md.
    const doc = await vscode.workspace.openTextDocument(
      uriFor('rootA', 'Index.md')
    );
    const links = provider.provideDocumentLinks(doc) ?? [];
    const aliased = links.find((l) => {
      const text = doc.getText(l.range);
      return text === '[[Foo|RootB Foo]]';
    });
    assert.ok(aliased, 'expected a DocumentLink for [[Foo|RootB Foo]]');
    assert.strictEqual(aliased!.tooltip, 'Open note: Foo');

    const resolved = await provider.resolveDocumentLink(aliased!);
    assert.ok(resolved.target, 'resolved link should have a target URI');
    assert.strictEqual(resolved.target!.scheme, 'file');
    assert.ok(
      resolved.target!.fsPath.endsWith(`${path.sep}rootA${path.sep}Foo.md`),
      `expected rootA/Foo.md, got ${resolved.target!.fsPath}`
    );
  });

  test('aliased link to missing note falls back to command: URI carrying bare target', async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content: '[[does-not-exist|Missing]]\n'
    });
    const links = provider.provideDocumentLinks(doc) ?? [];
    assert.strictEqual(links.length, 1);
    const link = links[0];
    assert.strictEqual(link.tooltip, 'Open note: does-not-exist');

    const resolved = await provider.resolveDocumentLink(link);
    assert.ok(resolved.target);
    assert.strictEqual(resolved.target!.scheme, 'command');
    assert.strictEqual(
      resolved.target!.path,
      'markdownLoom.openWikiLink',
      'should route to the openWikiLink command for missing notes'
    );
    // The command args carry the bare target, not the alias.
    const args = JSON.parse(decodeURIComponent(resolved.target!.query));
    assert.deepStrictEqual(args, ['does-not-exist']);
  });
});
