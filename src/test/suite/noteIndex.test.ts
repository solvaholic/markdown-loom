import * as assert from 'assert';
import { extractWikiLinksFromText } from '../../index/noteIndex';

suite('NoteIndex extraction', () => {
  test('finds links across lines (path-prefixed targets are skipped)', () => {
    // `[[B/C]]` is no longer a legal wikilink target (path separator); only
    // `[[A]]` is extracted. See docs/SPEC.md "Wikilink target syntax".
    const links = extractWikiLinksFromText('hello [[A]]\nworld [[B/C]]\n[[D]]\n');
    assert.strictEqual(links.length, 2);
    assert.strictEqual(links[0].rawTarget, 'A');
    assert.strictEqual(links[1].rawTarget, 'D');
    assert.strictEqual(links[0].range.start.line, 0);
    assert.strictEqual(links[1].range.start.line, 2);
  });

  test('strips alias from rawTarget for backlink indexing', () => {
    const links = extractWikiLinksFromText('see [[Note|Alias]] please');
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].rawTarget, 'Note');
  });

  test('skips links inside fenced code blocks', () => {
    const text = [
      '[[outside]]',
      '```',
      '[[in-fence]]',
      '```',
      '[[after]]'
    ].join('\n');
    const links = extractWikiLinksFromText(text);
    const targets = links.map((l) => l.rawTarget);
    assert.deepStrictEqual(targets, ['outside', 'after']);
  });

  test('handles tilde fences too', () => {
    const text = ['~~~', '[[in]]', '~~~', '[[out]]'].join('\n');
    const links = extractWikiLinksFromText(text);
    assert.deepStrictEqual(
      links.map((l) => l.rawTarget),
      ['out']
    );
  });

  test('ignores empty link bodies', () => {
    const links = extractWikiLinksFromText('a [[]] b [[ ]] c [[ok]]');
    assert.deepStrictEqual(
      links.map((l) => l.rawTarget),
      ['ok']
    );
  });

  test('captures multiple matches on one line', () => {
    const links = extractWikiLinksFromText('see [[A]] and [[B]] today');
    assert.strictEqual(links.length, 2);
    assert.notStrictEqual(
      links[0].range.start.character,
      links[1].range.start.character
    );
  });
});
