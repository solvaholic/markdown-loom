import * as assert from 'assert';
import MarkdownIt from 'markdown-it';
import { WikiLinkRenderer } from '../../providers/linkRenderer';

function render(input: string): string {
  const md = new MarkdownIt();
  new WikiLinkRenderer().extendMarkdownIt(md);
  return md.render(input);
}

suite('WikiLink Preview Renderer', () => {
  test('renders a single wikilink as an anchor', () => {
    const html = render('See [[Notes]] for more.');
    assert.match(html, /<a [^>]*href="Notes\.md"[^>]*>Notes<\/a>/);
  });

  test('renders multiple wikilinks on one line (regression: stale lastIndex)', () => {
    const html = render('[[first]] and [[second]] and [[third]]');
    assert.match(html, /href="first\.md"/);
    assert.match(html, /href="second\.md"/);
    assert.match(html, /href="third\.md"/);
  });

  test('renders wikilinks across multiple paragraphs', () => {
    const html = render('[[one]]\n\n[[two]]\n\n[[three]]');
    assert.match(html, /href="one\.md"/);
    assert.match(html, /href="two\.md"/);
    assert.match(html, /href="three\.md"/);
  });

  test('preserves an explicit .md extension without doubling it', () => {
    const html = render('[[Notes.md]]');
    assert.match(html, /href="Notes\.md"/);
    assert.doesNotMatch(html, /\.md\.md/);
  });

  test('encodes path segments but keeps the slash separators', () => {
    const html = render('[[folder/My Note]]');
    assert.match(html, /href="folder\/My%20Note\.md"/);
  });

  test('does not render wikilinks inside fenced code blocks', () => {
    const html = render('```\n[[ignored]]\n```');
    assert.doesNotMatch(html, /href="ignored\.md"/);
    assert.match(html, /\[\[ignored\]\]/);
  });

  test('does not emit a command: URI in preview output', () => {
    const html = render('[[Notes]]');
    assert.doesNotMatch(html, /command:/);
  });

  test('sets a tooltip-friendly title attribute on the anchor', () => {
    const html = render('[[Notes]]');
    assert.match(html, /title="Open note: Notes"/);
  });

  test('skips empty wikilinks', () => {
    const html = render('[[]] and [[ ]]');
    assert.doesNotMatch(html, /<a /);
  });
});
