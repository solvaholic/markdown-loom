import * as assert from 'assert';
import * as fs from 'fs';
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

  test('section ref: fallback href includes #slug', () => {
    const html = render('[[Notes#My Heading]]');
    assert.match(html, /href="Notes\.md#my-heading"/);
  });

  test('section ref: display is Note#Heading when no alias', () => {
    const html = render('[[Notes#My Heading]]');
    assert.match(html, />Notes#My Heading<\/a>/);
  });

  test('section ref: title includes #Heading', () => {
    const html = render('[[Notes#My Heading]]');
    assert.match(html, /title="Open note: Notes#My Heading"/);
  });

  test('section ref with alias: alias is display text', () => {
    const html = render('[[Notes#My Heading|Read More]]');
    assert.match(html, />Read More<\/a>/);
    assert.match(html, /href="Notes\.md#my-heading"/);
  });

  test('section ref: slug strips punctuation', () => {
    const html = render('[[Notes#Hello, World!]]');
    assert.match(html, /href="Notes\.md#hello-world"/);
  });

  test('section ref inside code block is not rendered as a link', () => {
    const html = render('```\n[[Notes#Heading]]\n```');
    assert.doesNotMatch(html, /href="Notes\.md#/);
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

  test('section ref: resolved href includes #slug fragment', () => {
    // Notes.md exists in rootA; [[Notes#Introduction]] should resolve to
    // ./Notes.md#introduction (slug = lowercase + spaces→hyphens).
    const html = renderWith(
      uriFor('rootA', 'Index.md'),
      '[[Notes#Introduction]]'
    );
    assert.match(html, /href="\.\/Notes\.md#introduction"/);
    assert.match(html, />Notes#Introduction<\/a>/);
  });

  test('section ref with alias: resolved href has fragment, alias is text', () => {
    const html = renderWith(
      uriFor('rootA', 'Index.md'),
      '[[Notes#Details|See Details]]'
    );
    assert.match(html, /href="\.\/Notes\.md#details"/);
    assert.match(html, />See Details<\/a>/);
  });

  test('section ref: data-href also includes fragment (regression guard)', () => {
    // VS Code's addLinkRenderer wraps us and copies href → data-href from the
    // fallback value; our resolver must overwrite both so preview navigation
    // lands at the heading rather than at the top of the file.
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
    const html = md.render('[[Notes#Introduction]]', {
      currentDocument: uriFor('rootA', 'Index.md')
    });
    assert.match(html, /href="\.\/Notes\.md#introduction"/);
    assert.match(html, /data-href="\.\/Notes\.md#introduction"/);
  });

  test('section ref to unknown note falls back with fragment in href', () => {
    // Missing note → fallback href includes the slug so the pattern is
    // consistent even before the file exists.
    const html = renderWith(
      uriFor('rootA', 'Index.md'),
      '[[NoSuchNote#My Section]]'
    );
    assert.match(html, /href="NoSuchNote\.md#my-section"/);
  });

  test('block ref: resolved href uses literal #^id (no slugify)', () => {
    // [[Blocks#^para-1]] from rootA/Index.md → ./Blocks.md#%5Epara-1
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[Blocks#^para-1]]');
    assert.match(html, /href="\.\/Blocks\.md#%5Epara-1"/);
  });

  test('block ref: data-href also uses literal #^id (regression guard)', () => {
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
    const html = md.render('[[Blocks#^para-1]]', {
      currentDocument: uriFor('rootA', 'Index.md')
    });
    assert.match(html, /data-href="\.\/Blocks\.md#%5Epara-1"/);
  });

  test('block ref: data-wikilink-blockref attribute is set on the anchor', () => {
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[Blocks#^para-1]]');
    assert.match(html, /data-wikilink-blockref="1"/);
  });

  test('block ref: link display defaults to bare note name (no #^id noise)', () => {
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[Blocks#^para-1]]');
    assert.match(html, />Blocks<\/a>/);
    assert.doesNotMatch(html, />Blocks#\^para-1<\/a>/);
  });

  test('block ref with alias: alias still wins over the default display', () => {
    const html = renderWith(
      uriFor('rootA', 'Index.md'),
      '[[Blocks#^para-1|See the first paragraph]]'
    );
    assert.match(html, />See the first paragraph<\/a>/);
  });

  test('block ref: anchor span is injected at the source line of the block id', () => {
    // Render Blocks.md itself with its real on-disk content so line numbers
    // align with what the index extracted.
    const blocksUri = uriFor('rootA', 'Blocks.md');
    const md = new MarkdownIt();
    new WikiLinkRenderer(index).extendMarkdownIt(md);
    const html = md.render(fs.readFileSync(blocksUri.fsPath, 'utf8'), {
      currentDocument: blocksUri
    });
    assert.match(html, /<span id="\^para-1" class="markdown-loom-blockref"><\/span>/);
    // The literal `^para-1` should no longer appear in the rendered paragraph.
    assert.doesNotMatch(html, /\^para-1<\/p>/);
  });

  test('block ref: anchor span is injected for list items', () => {
    const blocksUri = uriFor('rootA', 'Blocks.md');
    const md = new MarkdownIt();
    new WikiLinkRenderer(index).extendMarkdownIt(md);
    const html = md.render(fs.readFileSync(blocksUri.fsPath, 'utf8'), {
      currentDocument: blocksUri
    });
    assert.match(html, /<span id="\^list-1" class="markdown-loom-blockref"><\/span>/);
    assert.doesNotMatch(html, /\^list-1<\/li>/);
  });

  test('block ref to missing id still resolves the file (fallback)', () => {
    const html = renderWith(uriFor('rootA', 'Index.md'), '[[Blocks#^no-such]]');
    // File resolves; href fragment is the literal id even if unmatched.
    assert.match(html, /href="\.\/Blocks\.md#%5Eno-such"/);
  });

  test('section ref to existing note with non-existent heading resolves to the file (missing-heading fallback)', () => {
    // Per docs/SPEC.md: a section ref to a non-existent heading must still
    // navigate to the file — no hard error. The href resolves to the note file
    // with the slug fragment (the preview simply won't scroll anywhere since
    // no matching anchor exists, which is acceptable).
    const html = renderWith(
      uriFor('rootA', 'Index.md'),
      '[[Notes#NoSuchHeadingXYZ]]'
    );
    // Notes.md exists → resolved href, not fallback; fragment is still present.
    assert.match(html, /href="\.\/Notes\.md#nosuchheadingxyz"/);
  });
});
