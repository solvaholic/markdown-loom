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

  test('does not render path-prefixed targets as wikilinks', () => {
    // Per docs/SPEC.md "Wikilink target syntax", `/` in a target makes the
    // pattern not a wikilink at all - the raw text passes through.
    const html = render('[[folder/My Note]]');
    assert.doesNotMatch(html, /<a [^>]*markdown-loom-wikilink/);
    assert.match(html, /\[\[folder\/My Note\]\]/);
  });

  test('renders alias text but encodes target in href', () => {
    const html = render('[[Note Name|Stacey]]');
    assert.match(html, /href="Note%20Name\.md"/);
    assert.match(html, />Stacey<\/a>/);
    assert.match(html, /title="Open note: Note Name"/);
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

  test('cross-root link resolves via NoteIndex by basename (rootA -> rootB)', () => {
    // Path-prefixed `[[rootB/Foo]]` is no longer legal; the bare basename
    // `[[Foo]]` from rootA/Index.md prefers rootA/Foo.md (same-root tiebreak).
    // Use a bare basename that only exists in rootB to confirm cross-root
    // basename resolution still produces a relative href into the other root.
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[Sibling]]');
    assert.match(html, /href="\.\.\/rootB\/Sibling\.md"/);
  });

  test('same-folder link gets a leading ./', () => {
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[Notes]]');
    assert.match(html, /href="\.\/Notes\.md"/);
  });

  test('nested folder link resolves by basename', () => {
    // `[[folder/Nested]]` is illegal under the new spec; the bare `[[Nested]]`
    // basename match still produces the resolved relative path.
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[Nested]]');
    assert.match(html, /href="\.\/folder\/Nested\.md"/);
  });

  test('unresolved target falls back to bare target.md', () => {
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[does-not-exist]]');
    assert.match(html, /href="does-not-exist\.md"/);
  });

  test('renders correctly when env has no source URI', () => {
    const md = new MarkdownIt();
    new WikiLinkRenderer(index).extendMarkdownIt(md);
    const html = md.render('[[Foo]]');
    assert.match(html, /href="Foo\.md"/);
  });

  test('aliased link resolves target and renders alias text', () => {
    const html = renderWith(
      uriFor('rootA', 'Index.md'),
      '[[Notes|Reading List]]'
    );
    assert.match(html, /href="\.\/Notes\.md"/);
    assert.match(html, />Reading List<\/a>/);
  });

  test('data-href tracks resolved href when host wraps link_open after us (regression: issue #11)', () => {
    // Simulates microsoft/vscode markdownEngine.ts #addLinkRenderer, which
    // installs its link_open AFTER plugin contributions, so it wraps ours and
    // runs FIRST. It copies the current `href` into `data-href`, which the
    // preview's click handler then navigates to. If we only update `href` in
    // our wikiRule, `data-href` keeps the fallback (source-adjacent) value
    // and the rendered link 404s.
    const md = new MarkdownIt();
    new WikiLinkRenderer(index).extendMarkdownIt(md);
    const previous = md.renderer.rules.link_open;
    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const href = token.attrGet('href');
      if (typeof href === 'string') {
        token.attrSet('data-href', href);
      }
      if (previous) {
        return previous(tokens, idx, options, env, self);
      }
      return self.renderToken(tokens, idx, options);
    };
    const html = md.render('[[Nested]]', {
      currentDocument: uriFor('rootA', 'Index.md')
    });
    assert.match(html, /href="\.\/folder\/Nested\.md"/);
    assert.match(html, /data-href="\.\/folder\/Nested\.md"/);
    assert.doesNotMatch(html, /data-href="Nested\.md"/);
  });
});
