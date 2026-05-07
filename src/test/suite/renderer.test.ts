import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { NoteIndex } from '../../index/noteIndex';
import { WikiLinkRenderer } from '../../providers/linkRenderer';

function render(input: string): string {
  const md = new MarkdownIt();
  new WikiLinkRenderer().extendMarkdownIt(md);
  return md.render(input);
}

function fixturePath(...parts: string[]): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = folders[0]?.uri.fsPath ?? '';
  return path.join(path.dirname(root), ...parts);
}

function uriFor(...parts: string[]): vscode.Uri {
  return vscode.Uri.file(fixturePath(...parts));
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

suite('WikiLink Preview Renderer (NoteIndex-aware)', () => {
  let index: NoteIndex;

  suiteSetup(async () => {
    index = new NoteIndex();
    await index.ready();
  });

  suiteTeardown(() => {
    index.dispose();
  });

  function renderWith(source: vscode.Uri, body: string): string {
    const md = new MarkdownIt();
    new WikiLinkRenderer(index).extendMarkdownIt(md);
    return md.render(body, { currentDocument: source });
  }

  test('cross-root link resolves via NoteIndex (rootA -> rootB)', () => {
    // rootA/Index.md links to [[rootB/Foo]] and the preview should land on
    // ../rootB/Foo.md, not the broken rootA/rootB/Foo.md the browser would
    // produce from a naive relative href.
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[rootB/Foo]]');
    assert.match(html, /href="\.\.\/rootB\/Foo\.md"/);
  });

  test('same-folder link gets a leading ./', () => {
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[Notes]]');
    assert.match(html, /href="\.\/Notes\.md"/);
  });

  test('nested folder link renders the resolved relative path', () => {
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[folder/Nested]]');
    assert.match(html, /href="\.\/folder\/Nested\.md"/);
  });

  test('unresolved target falls back to bare target.md', () => {
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[does-not-exist]]');
    assert.match(html, /href="does-not-exist\.md"/);
  });

  test('renders correctly when env has no source URI', () => {
    const md = new MarkdownIt();
    new WikiLinkRenderer(index).extendMarkdownIt(md);
    const html = md.render('[[rootB/Foo]]');
    assert.match(html, /href="rootB\/Foo\.md"/);
  });
});
