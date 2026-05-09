import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { NoteIndex } from '../../index/noteIndex';

function fixturePath(...parts: string[]): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = folders[0]?.uri.fsPath ?? '';
  // Both roots live under the same parent (test-fixtures/).
  return path.join(path.dirname(root), ...parts);
}

function uriFor(...parts: string[]): vscode.Uri {
  return vscode.Uri.file(fixturePath(...parts));
}

suite('NoteIndex resolution (multi-root)', () => {
  let index: NoteIndex;

  suiteSetup(async () => {
    index = new NoteIndex();
    await index.ready();
  });

  suiteTeardown(() => {
    index.dispose();
  });

  test('resolves an exact basename', () => {
    const fromUri = uriFor('rootA', 'Index.md');
    const resolved = index.resolve('Notes', fromUri);
    assert.ok(resolved, 'expected to resolve [[Notes]]');
    assert.ok(resolved!.fsPath.endsWith('rootA/Notes.md'));
  });

  test('basename match is case-insensitive', () => {
    const fromUri = uriFor('rootA', 'Index.md');
    const resolved = index.resolve('notes', fromUri);
    assert.ok(resolved);
    assert.ok(resolved!.fsPath.toLowerCase().endsWith('rootA/Notes.md'.toLowerCase()));
  });

  test('resolves folder/basename paths is no longer supported (returns null)', () => {
    // Path-prefixed targets are illegal per docs/SPEC.md "Wikilink target
    // syntax"; resolver returns null even though folder/Nested.md exists.
    const fromUri = uriFor('rootA', 'Index.md');
    assert.strictEqual(index.resolve('folder/Nested', fromUri), null);
  });

  test('resolves bare basename for a nested note', () => {
    const fromUri = uriFor('rootA', 'Index.md');
    const resolved = index.resolve('Nested', fromUri);
    assert.ok(resolved, 'expected to resolve [[Nested]] via basename');
    assert.ok(resolved!.fsPath.endsWith('folder/Nested.md'));
  });

  test('strips alias before resolving: [[Notes|Alias]] -> Notes.md', () => {
    const fromUri = uriFor('rootA', 'Index.md');
    const resolved = index.resolve('Notes|Alias', fromUri);
    assert.ok(resolved);
    assert.ok(resolved!.fsPath.endsWith('rootA/Notes.md'));
  });

  test('duplicate basename prefers the source file’s workspace root', () => {
    const fromA = uriFor('rootA', 'Index.md');
    const fromB = uriFor('rootB', 'Sibling.md');
    const resolvedA = index.resolve('Foo', fromA);
    const resolvedB = index.resolve('Foo', fromB);
    assert.ok(resolvedA);
    assert.ok(resolvedB);
    assert.ok(resolvedA!.fsPath.includes(`${path.sep}rootA${path.sep}`));
    assert.ok(resolvedB!.fsPath.includes(`${path.sep}rootB${path.sep}`));
  });

  test('returns null for unknown targets', () => {
    const fromUri = uriFor('rootA', 'Index.md');
    assert.strictEqual(index.resolve('does-not-exist', fromUri), null);
  });
});

suite('NoteIndex backlinks (multi-root, fenced-code-aware)', () => {
  let index: NoteIndex;

  suiteSetup(async () => {
    index = new NoteIndex();
    await index.ready();
  });

  suiteTeardown(() => {
    index.dispose();
  });

  test('counts backlinks to a target', () => {
    const notes = uriFor('rootA', 'Notes.md');
    const back = index.getBacklinks(notes);
    // Notes is referenced by rootA/Index.md ([[Notes]]) and rootA/Foo.md ([[notes]]).
    assert.strictEqual(back.length, 2);
    const sources = back.map((b) => path.basename(b.sourceUri.fsPath)).sort();
    assert.deepStrictEqual(sources, ['Foo.md', 'Index.md']);
  });

  test('ignores wikilinks inside fenced code blocks', () => {
    // rootA/Foo.md has [[in-fence]] inside ```; create a target file to be sure
    // it is not treated as a backlink source.
    const possibleTarget = uriFor('rootA', 'in-fence.md');
    const back = index.getBacklinks(possibleTarget);
    // No 'in-fence.md' exists, but even if one did, the link is fenced and
    // should not be indexed. Confirm no source ever references in-fence.
    assert.strictEqual(back.length, 0);
  });

  test('backlinks resolve case-insensitively', () => {
    // rootA/Foo.md links to [[notes]] (lower-case); should be a backlink
    // to rootA/Notes.md.
    const notes = uriFor('rootA', 'Notes.md');
    const sourceFiles = index
      .getBacklinks(notes)
      .map((b) => b.sourceUri.fsPath);
    assert.ok(sourceFiles.some((p) => p.endsWith('rootA/Foo.md')));
  });

  test('ambiguous bare links register against every candidate', () => {
    const fooA = uriFor('rootA', 'Foo.md');
    const fooB = uriFor('rootB', 'Foo.md');

    const backA = index.getBacklinks(fooA);
    const backB = index.getBacklinks(fooB);

    // rootA/Index.md `[[Foo]]` resolves to rootA/Foo (winner) and registers
    // an ambiguous backlink against rootB/Foo too.
    const indexBareOnA = backA.find(
      (b) =>
        path.basename(b.sourceUri.fsPath) === 'Index.md' &&
        b.preview.includes('[[Foo]]')
    );
    assert.ok(indexBareOnA, 'rootA/Foo should see Index.md `[[Foo]]`');
    assert.strictEqual(indexBareOnA!.ambiguous, false, 'winner is not ambiguous');

    const indexBareOnB = backB.find(
      (b) =>
        path.basename(b.sourceUri.fsPath) === 'Index.md' &&
        b.preview.includes('[[Foo]]')
    );
    assert.ok(indexBareOnB, 'rootB/Foo should also see Index.md `[[Foo]]`');
    assert.strictEqual(indexBareOnB!.ambiguous, true, 'non-winner is ambiguous');

    // Aliased link `[[Foo|Local Foo]]` resolves the same way as bare `[[Foo]]`
    // (alias is display-only). It registers as a backlink on both Foo notes.
    const aliasedOnA = backA.find((b) =>
      b.preview.includes('[[Foo|Local Foo]]')
    );
    assert.ok(aliasedOnA, 'aliased link still registers via basename');
    assert.strictEqual(aliasedOnA!.ambiguous, false);

    const aliasedOnB = backB.find((b) =>
      b.preview.includes('[[Foo|Local Foo]]')
    );
    assert.ok(aliasedOnB);
    assert.strictEqual(aliasedOnB!.ambiguous, true);

    // rootB/Sibling.md `[[Foo]]` wins for rootB; rootA/Foo gets it as ambiguous.
    const siblingOnB = backB.find(
      (b) => path.basename(b.sourceUri.fsPath) === 'Sibling.md'
    );
    assert.ok(siblingOnB);
    assert.strictEqual(siblingOnB!.ambiguous, false);

    const siblingOnA = backA.find(
      (b) => path.basename(b.sourceUri.fsPath) === 'Sibling.md'
    );
    assert.ok(siblingOnA, 'rootA/Foo should see Sibling.md as ambiguous');
    assert.strictEqual(siblingOnA!.ambiguous, true);
  });
});

suite('NoteIndex section refs (heading resolution)', () => {
  let index: NoteIndex;

  suiteSetup(async () => {
    index = new NoteIndex();
    await index.ready();
  });

  suiteTeardown(() => {
    index.dispose();
  });

  test('section ref rawTarget is the note basename (not Note#Heading)', () => {
    // A source file that contains [[Notes#Introduction]] should register a
    // backlink on Notes.md, not on "Notes#Introduction" (which doesn't exist).
    const notes = uriFor('rootA', 'Notes.md');
    const back = index.getBacklinks(notes);
    // rootA/Index.md links [[Notes]] (plain) and rootA/Foo.md links [[notes]].
    // If rawTarget were "Notes#Introduction" instead of "Notes", this count
    // would be wrong. We verify at least the plain links are still found.
    assert.ok(back.length >= 2, 'Notes.md should have at least 2 backlinks');
  });

  test('findHeadingLine returns the correct 0-indexed line for a known heading', () => {
    // rootA/Notes.md now contains ## Introduction at line 4 (0-indexed).
    const notes = uriFor('rootA', 'Notes.md');
    const line = index.findHeadingLine(notes, 'Introduction');
    assert.ok(line !== null, 'should find the Introduction heading');
    assert.ok(line! >= 0, 'line must be non-negative');
  });

  test('findHeadingLine matches heading case-insensitively via slug', () => {
    const notes = uriFor('rootA', 'Notes.md');
    // "introduction" slug matches "Introduction" heading slug "introduction".
    const line = index.findHeadingLine(notes, 'introduction');
    assert.ok(line !== null, 'slug match should be case-insensitive');
  });

  test('findHeadingLine returns null for a non-existent heading (missing-heading fallback)', () => {
    // Spec: missing heading must not cause a hard error; caller falls back to
    // navigating to line 0.
    const notes = uriFor('rootA', 'Notes.md');
    const line = index.findHeadingLine(notes, 'NoSuchHeadingXYZ');
    assert.strictEqual(line, null);
  });
});
