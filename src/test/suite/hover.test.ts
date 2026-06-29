import * as assert from 'assert';
import * as vscode from 'vscode';
import { NoteIndex } from '../../index/noteIndex';
import {
  WikiLinkHoverProvider,
  stripFrontmatter,
} from '../../providers/linkHoverProvider';

async function hoverFor(
  provider: WikiLinkHoverProvider,
  content: string,
  charInLink = 3
): Promise<string | null> {
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content,
  });
  const hover = await provider.provideHover(
    doc,
    new vscode.Position(0, charInLink)
  );
  if (!hover) {
    return null;
  }
  const md = hover.contents[0] as vscode.MarkdownString;
  return md.value;
}

suite('WikiLinkHoverProvider (#4)', () => {
  let index: NoteIndex;
  let provider: WikiLinkHoverProvider;

  suiteSetup(async () => {
    index = new NoteIndex();
    await index.ready();
    provider = new WikiLinkHoverProvider(index);
  });

  suiteTeardown(() => {
    index.dispose();
  });

  test('renders preview of an existing note', async () => {
    const value = await hoverFor(provider, '[[Notes]]');
    assert.ok(value, 'expected a hover preview');
    assert.ok(value!.includes('# Notes'), `got: ${value}`);
  });

  test('missing note returns no hover (deferred to DocumentLink tooltip, #59)', async () => {
    const value = await hoverFor(provider, '[[does-not-exist]]');
    assert.strictEqual(value, null);
  });

  test('non-markdown attachment target returns no hover', async () => {
    const value = await hoverFor(provider, '[[Some File.pdf]]', 3);
    assert.strictEqual(value, null);
  });

  test('no hover inside fenced code block', async () => {
    const value = await hoverFor(provider, '```\n[[Notes]]\n```', 3);
    assert.strictEqual(value, null);
  });

  test('strips leading frontmatter', () => {
    const out = stripFrontmatter('---\ntitle: x\n---\n# Body\n');
    assert.ok(!out.includes('title:'), out);
    assert.ok(out.startsWith('# Body'), out);
  });

  test('section ref starts preview at the heading', async () => {
    const value = await hoverFor(provider, '[[Notes#My Section]]');
    assert.ok(value, 'expected a hover preview');
    assert.ok(value!.includes('My Section'), `got: ${value}`);
  });

  test('does not recurse into nested wikilinks', async () => {
    const value = await hoverFor(provider, '[[Index]]');
    assert.ok(value, 'expected a hover preview');
    assert.ok(!value!.includes('[['), `preview should flatten links: ${value}`);
  });
});
