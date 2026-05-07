import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { NoteIndex } from './index/noteIndex';
import { WikiLinkCompletionProvider } from './providers/linkCompletionProvider';
import { WikiLinkDefinitionProvider } from './providers/linkDefinitionProvider';
import { WikiLinkDocumentLinkProvider } from './providers/linkDocumentLinkProvider';
import { createWikiLinkCommandHandler } from './providers/linkCommands';
import { WikiLinkRenderer } from './providers/linkRenderer';
import { BacklinksProvider } from './providers/backlinksProvider';
import { createToggleTaskCommand } from './tasks/toggleCommand';

export function activate(context: vscode.ExtensionContext): void {
  const noteIndex = new NoteIndex();
  context.subscriptions.push(noteIndex);

  const completionProvider = new WikiLinkCompletionProvider(noteIndex);
  const definitionProvider = new WikiLinkDefinitionProvider(noteIndex);
  const documentLinkProvider = new WikiLinkDocumentLinkProvider(noteIndex);
  const backlinksProvider = new BacklinksProvider(noteIndex);
  context.subscriptions.push(backlinksProvider);

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown', scheme: 'file' },
      completionProvider,
      '[',
      '/'
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: 'markdown', scheme: 'file' },
      definitionProvider
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      { language: 'markdown', scheme: 'file' },
      documentLinkProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdownLoom.openWikiLink',
      createWikiLinkCommandHandler(noteIndex)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdownLoom.toggleTask',
      createToggleTaskCommand()
    )
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'markdownLoom.backlinks',
      backlinksProvider
    )
  );
}

export function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
  const renderer = new WikiLinkRenderer();
  return renderer.extendMarkdownIt(md);
}

export function deactivate(): void {
  // No-op
}
