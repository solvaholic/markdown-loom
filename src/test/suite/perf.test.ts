import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { NoteIndex } from '../../index/noteIndex';

const PERF_DIR_NAME = 'perf-1000';
const NOTE_COUNT = 1000;
const FROM_NOTE = 'note-0001';

function fixtureRoot(): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = folders[0]?.uri.fsPath ?? '';
  return path.dirname(root);
}

function ensurePerfFixtures(): { dir: string; fromUri: vscode.Uri } {
  const fixtureBase = fixtureRoot();
  const dir = path.join(fixtureBase, 'rootA', PERF_DIR_NAME);
  const sentinel = path.join(dir, `note-${String(NOTE_COUNT).padStart(4, '0')}.md`);
  if (!fs.existsSync(sentinel)) {
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 1; i <= NOTE_COUNT; i += 1) {
      const name = `note-${String(i).padStart(4, '0')}`;
      const next = `note-${String((i % NOTE_COUNT) + 1).padStart(4, '0')}`;
      // Wikilink targets are bare basenames per docs/SPEC.md "Wikilink target
      // syntax". One link per note keeps the perf model simple.
      const content = `# ${name}\n\nLinks to [[${next}]].\n`;
      fs.writeFileSync(path.join(dir, `${name}.md`), content, 'utf-8');
    }
  }
  return {
    dir,
    fromUri: vscode.Uri.file(path.join(dir, `${FROM_NOTE}.md`))
  };
}

suite('NoteIndex perf smoke (1000 notes)', function () {
  this.timeout(60000);

  let index: NoteIndex;

  suiteSetup(async () => {
    ensurePerfFixtures();
    index = new NoteIndex();
    await index.ready();
  });

  suiteTeardown(() => {
    index.dispose();
  });

  test('resolve() is O(1)-ish: 5000 calls under 100ms', () => {
    const fixtureBase = fixtureRoot();
    const fromUri = vscode.Uri.file(
      path.join(fixtureBase, 'rootA', PERF_DIR_NAME, `${FROM_NOTE}.md`)
    );
    const start = Date.now();
    for (let i = 0; i < 5000; i += 1) {
      const idx = (i % NOTE_COUNT) + 1;
      const target = `note-${String(idx).padStart(4, '0')}`;
      const resolved = index.resolve(target, fromUri);
      assert.ok(resolved);
    }
    const elapsed = Date.now() - start;
    assert.ok(
      elapsed < 100,
      `Expected 5000 resolves under 100ms; took ${elapsed}ms`
    );
  });

  test('getBacklinks() returns expected count quickly', () => {
    const fixtureBase = fixtureRoot();
    // note-0001 is referenced once: by note-1000 (whose successor wraps to 1).
    const targetUri = vscode.Uri.file(
      path.join(fixtureBase, 'rootA', PERF_DIR_NAME, `${FROM_NOTE}.md`)
    );
    const start = Date.now();
    const back = index.getBacklinks(targetUri);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50, `Backlink lookup took ${elapsed}ms`);
    assert.strictEqual(
      back.length,
      1,
      `Expected exactly 1 backlink, got ${back.length}`
    );
  });
});
