import * as assert from 'assert';
import * as path from 'path';
import { NoteIndex } from '../../index/noteIndex';
import { buildUnresolvedLinkItems } from '../../commands/showUnresolvedWikilinks';

function endsWith(fsPath: string, ...parts: string[]): boolean {
  return fsPath.endsWith(parts.join(path.sep));
}

suite('Unresolved wikilinks diagnostic', () => {
  let index: NoteIndex;

  suiteSetup(async () => {
    index = new NoteIndex();
    await index.ready();
  });

  suiteTeardown(() => {
    index.dispose();
  });

  test('reports unresolved targets from Broken.md', () => {
    const unresolved = index.getUnresolvedLinks();
    const fromBroken = unresolved.filter((u) =>
      endsWith(u.sourceUri.fsPath, 'rootA', 'Broken.md')
    );
    const targets = fromBroken.map((u) => u.target);
    assert.ok(
      targets.includes('Nonexistent Note'),
      'expected [[Nonexistent Note]] to be unresolved'
    );
    assert.ok(
      targets.includes('Another Missing'),
      'expected [[Another Missing]] to be unresolved'
    );
  });

  test('excludes resolved links and fenced links', () => {
    const unresolved = index.getUnresolvedLinks();
    const fromBroken = unresolved.filter((u) =>
      endsWith(u.sourceUri.fsPath, 'rootA', 'Broken.md')
    );
    const targets = fromBroken.map((u) => u.target);
    // [[Index]] resolves to rootA/Index.md and must not be reported.
    assert.ok(!targets.includes('Index'), '[[Index]] resolves; must be excluded');
    // [[In Fence Missing]] sits inside a fenced block and is never indexed.
    assert.ok(
      !targets.includes('In Fence Missing'),
      'fenced links are not indexed, so cannot be unresolved'
    );
  });

  test('carries the source range for navigation', () => {
    const unresolved = index.getUnresolvedLinks();
    const first = unresolved.find(
      (u) =>
        endsWith(u.sourceUri.fsPath, 'rootA', 'Broken.md') &&
        u.target === 'Nonexistent Note'
    );
    assert.ok(first, 'expected to find the Nonexistent Note entry');
    // The range must cover the full [[...]] token so selecting it lands on the link.
    assert.ok(first!.range.start.line >= 0);
    assert.ok(first!.range.end.character > first!.range.start.character);
    assert.ok(first!.preview.includes('[[Nonexistent Note]]'));
  });

  test('results are sorted by source path then line', () => {
    const unresolved = index.getUnresolvedLinks();
    for (let i = 1; i < unresolved.length; i += 1) {
      const prev = unresolved[i - 1];
      const curr = unresolved[i];
      const prevKey = prev.sourceUri.fsPath.toLowerCase();
      const currKey = curr.sourceUri.fsPath.toLowerCase();
      if (prevKey === currKey) {
        assert.ok(
          prev.range.start.line <= curr.range.start.line,
          'entries within a file must be ordered by line'
        );
      } else {
        assert.ok(prevKey <= currKey, 'entries must be ordered by source path');
      }
    }
  });

  test('buildUnresolvedLinkItems formats label, description, detail', () => {
    const unresolved = index.getUnresolvedLinks();
    const entry = unresolved.find(
      (u) =>
        endsWith(u.sourceUri.fsPath, 'rootA', 'Broken.md') &&
        u.target === 'Nonexistent Note'
    );
    assert.ok(entry);
    const [item] = buildUnresolvedLinkItems([entry!]);
    assert.ok(item.label.includes('[[Nonexistent Note]]'));
    // 1-based line number in the description.
    assert.ok(
      item.description!.endsWith(`:${entry!.range.start.line + 1}`),
      `expected description to end with 1-based line, got "${item.description}"`
    );
    assert.strictEqual(item.detail, entry!.preview);
    assert.strictEqual(item.link, entry);
  });
});
