import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { WikiLinkCompletionProvider } from './providers/linkCompletionProvider';
import { WikiLinkDefinitionProvider } from './providers/linkDefinitionProvider';
import { WikiLinkDocumentLinkProvider } from './providers/linkDocumentLinkProvider';
import { createWikiLinkCommandHandler } from './providers/linkCommands';
import { WikiLinkRenderer } from './providers/linkRenderer';

export function activate(context: vscode.ExtensionContext): void {
  const completionProvider = new WikiLinkCompletionProvider();
  const definitionProvider = new WikiLinkDefinitionProvider();
  const documentLinkProvider = new WikiLinkDocumentLinkProvider();

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
      createWikiLinkCommandHandler()
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
