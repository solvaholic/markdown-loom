import * as assert from 'assert';
import { matchWikiLinks } from '../../providers/linkParsing';
import { extractWikiLinksFromText } from '../../index/noteIndex';

suite('WikiLink Parsing Tests', () => {
  test('Should parse simple wikilink', () => {
    const text = 'This is a [[test-link]] in text';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, 'test-link');
    assert.strictEqual(links[0].section, null);
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
    assert.strictEqual(links[0].section, null);
  });

  test('Section ref: [[Note#Heading]] parses target and section', () => {
    const text = '[[Note Name#My Heading]]';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, 'Note Name');
    assert.strictEqual(links[0].section, 'My Heading');
    assert.strictEqual(links[0].display, 'Note Name#My Heading');
    assert.strictEqual(links[0].raw, '[[Note Name#My Heading]]');
  });

  test('Section ref with alias: [[Note#Heading|Alias]] uses alias as display', () => {
    const text = '[[Note Name#My Heading|Read more]]';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, 'Note Name');
    assert.strictEqual(links[0].section, 'My Heading');
    assert.strictEqual(links[0].display, 'Read more');
  });

  test('Empty section (bare #) is treated as no section', () => {
    const text = '[[Note#]]';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, 'Note');
    assert.strictEqual(links[0].section, null);
    // Display must not include the bare trailing '#'.
    assert.strictEqual(links[0].display, 'Note');
  });

  test('Section ref does not prevent backlink indexing on the note', () => {
    // The rawTarget stored for backlinks must be just the note basename.
    const links = extractWikiLinksFromText('See [[Notes#Introduction]] for more.');
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].rawTarget, 'Notes');
  });

  test('Pipe inside alias is preserved (only first | is the separator)', () => {
    const text = '[[Foo|Bar|Baz]]';
    const links = matchWikiLinks(text, 0);

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].target, 'Foo');
    assert.strictEqual(links[0].display, 'Bar|Baz');
    assert.strictEqual(links[0].raw, '[[Foo|Bar|Baz]]');
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
