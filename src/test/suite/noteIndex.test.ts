import * as assert from 'assert';
import {
  extractWikiLinksFromText,
  extractHeadingsFromText,
  extractBlockIdsFromText,
  slugifyHeading
} from '../../index/noteIndex';

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

  test('section ref: rawTarget is the note basename, not Note#Heading', () => {
    const links = extractWikiLinksFromText('see [[Notes#Introduction]] please');
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].rawTarget, 'Notes');
  });
});

suite('slugifyHeading', () => {
  test('lowercases and replaces spaces with hyphens', () => {
    assert.strictEqual(slugifyHeading('My Heading'), 'my-heading');
  });

  test('strips non-word characters', () => {
    assert.strictEqual(slugifyHeading('Hello, World!'), 'hello-world');
  });

  test('collapses multiple spaces into a single hyphen', () => {
    // \s+ in the slugifier collapses consecutive whitespace to one hyphen,
    // matching VS Code preview's heading-anchor behaviour.
    assert.strictEqual(slugifyHeading('A  B'), 'a-b');
  });

  test('handles headings that are already slug-like', () => {
    assert.strictEqual(slugifyHeading('my-heading'), 'my-heading');
  });

  test('trims leading/trailing whitespace', () => {
    assert.strictEqual(slugifyHeading('  Heading  '), 'heading');
  });
});

suite('extractHeadingsFromText', () => {
  test('extracts ATX headings with their line numbers', () => {
    const text = '# Title\n\nSome text.\n\n## Section\n\n### Subsection';
    const headings = extractHeadingsFromText(text);
    assert.strictEqual(headings.length, 3);
    assert.strictEqual(headings[0].text, 'Title');
    assert.strictEqual(headings[0].line, 0);
    assert.strictEqual(headings[1].text, 'Section');
    assert.strictEqual(headings[1].line, 4);
    assert.strictEqual(headings[2].text, 'Subsection');
    assert.strictEqual(headings[2].line, 6);
  });

  test('computes slug for each heading', () => {
    const text = '## My Heading\n## Another One!';
    const headings = extractHeadingsFromText(text);
    assert.strictEqual(headings[0].slug, 'my-heading');
    assert.strictEqual(headings[1].slug, 'another-one');
  });

  test('skips headings inside fenced code blocks', () => {
    const text = ['# Outside', '```', '# Inside', '```', '# AfterFence'].join('\n');
    const headings = extractHeadingsFromText(text);
    const texts = headings.map((h) => h.text);
    assert.deepStrictEqual(texts, ['Outside', 'AfterFence']);
  });

  test('handles tilde fences too', () => {
    const text = ['~~~', '# in-fence', '~~~', '# out'].join('\n');
    const headings = extractHeadingsFromText(text);
    assert.deepStrictEqual(
      headings.map((h) => h.text),
      ['out']
    );
  });

  test('returns empty array for text with no headings', () => {
    const headings = extractHeadingsFromText('Just some text.\n\nMore text.');
    assert.strictEqual(headings.length, 0);
  });
});

suite('extractBlockIdsFromText', () => {
  test('extracts a trailing ^id on a paragraph line', () => {
    const ids = extractBlockIdsFromText('Some paragraph. ^abc-123');
    assert.strictEqual(ids.length, 1);
    assert.strictEqual(ids[0].id, 'abc-123');
    assert.strictEqual(ids[0].line, 0);
  });

  test('extracts ^id from a list item line', () => {
    const text = '- first item ^one\n- second item';
    const ids = extractBlockIdsFromText(text);
    assert.deepStrictEqual(
      ids.map((b) => [b.id, b.line]),
      [['one', 0]]
    );
  });

  test('extracts multiple ids across the document', () => {
    const text = ['para a ^a', '', 'para b ^bee-2', '', 'para c'].join('\n');
    const ids = extractBlockIdsFromText(text);
    assert.deepStrictEqual(
      ids.map((b) => [b.id, b.line]),
      [
        ['a', 0],
        ['bee-2', 2]
      ]
    );
  });

  test('skips block ids inside fenced code blocks', () => {
    const text = ['real ^outside', '```', 'fake ^inside', '```', 'real ^after'].join('\n');
    const ids = extractBlockIdsFromText(text);
    assert.deepStrictEqual(
      ids.map((b) => b.id),
      ['outside', 'after']
    );
  });

  test('does not match a ^ that is not preceded by whitespace', () => {
    // `foo^bar` is not a block id — it's just text containing a caret.
    const ids = extractBlockIdsFromText('foo^bar');
    assert.strictEqual(ids.length, 0);
  });

  test('does not match a ^id followed by other text on the same line', () => {
    // Block ids only appear at end-of-line.
    const ids = extractBlockIdsFromText('text ^abc more text');
    assert.strictEqual(ids.length, 0);
  });

  test('allows trailing whitespace after the id', () => {
    const ids = extractBlockIdsFromText('text ^abc   ');
    assert.deepStrictEqual(
      ids.map((b) => b.id),
      ['abc']
    );
  });

  test('returns empty for text without ids', () => {
    assert.strictEqual(extractBlockIdsFromText('plain prose with no ids').length, 0);
  });
});
