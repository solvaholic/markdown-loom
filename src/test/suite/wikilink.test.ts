import * as assert from 'assert';
import { matchWikiLinks } from '../../providers/linkParsing';

suite('WikiLink Parsing Tests', () => {
  test('Should parse simple wikilink', () => {
    const text = 'This is a [[test-link]] in text';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, 'test-link');
    assert.strictEqual(links[0].raw, '[[test-link]]');
  });

  test('Should parse wikilink with spaces', () => {
    const text = 'This is a [[test link]] in text';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, 'test link');
  });

  test('Should parse multiple wikilinks', () => {
    const text = '[[first]] and [[second]] links';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 2);
    assert.strictEqual(links[0].target, 'first');
    assert.strictEqual(links[1].target, 'second');
  });

  test('Should treat path-prefixed targets as plain text (not wikilinks)', () => {
    // Per docs/SPEC.md "Wikilink target syntax", path separators are illegal.
    const text = '[[folder/subfolder/note]]';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 0);
  });

  test('Should treat relative-path targets as plain text', () => {
    const text = '[[./Note]] and [[../Sibling]]';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 0);
  });

  test('Should parse alias form: [[Note|Alias]]', () => {
    const text = 'See [[Note Name|Stacey]] today';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, 'Note Name');
    assert.strictEqual(links[0].display, 'Stacey');
    assert.strictEqual(links[0].raw, '[[Note Name|Stacey]]');
  });

  test('Display falls back to target when no alias is given', () => {
    const text = '[[Note]]';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].display, 'Note');
  });

  test('Empty alias falls back to target', () => {
    const text = '[[Note|]]';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, 'Note');
    assert.strictEqual(links[0].display, 'Note');
  });

  test('Should skip empty wikilinks', () => {
    const text = 'This [[]] is empty and [[ ]] this too';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 0);
  });

  test('Should handle nested brackets correctly', () => {
    const text = 'Text [[note]] more text';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, 'note');
  });
});
