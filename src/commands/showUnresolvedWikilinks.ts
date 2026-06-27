import * as vscode from 'vscode';
import { NoteIndex, UnresolvedLink } from '../index/noteIndex';

interface UnresolvedLinkQuickPickItem extends vscode.QuickPickItem {
  link: UnresolvedLink;
}

/**
 * Build the QuickPick items for a set of unresolved links. Kept separate from
 * the UI so it can be unit-tested. Each item shows the unresolved target as the
 * label, the source line as detail, and the workspace-relative path plus
 * 1-based line number as the description.
 */
export function buildUnresolvedLinkItems(
  links: UnresolvedLink[]
): UnresolvedLinkQuickPickItem[] {
  return links.map((link) => {
    const line = link.range.start.line + 1;
    const relativePath = vscode.workspace.asRelativePath(link.sourceUri, true);
    return {
      label: `$(warning) [[${link.target}]]`,
      description: `${relativePath}:${line}`,
      detail: link.preview,
      link
    };
  });
}

/**
 * Create the `markdownLoom.showUnresolvedWikilinks` command handler.
 *
 * Walks the index for wikilinks whose target does not resolve and presents
 * them in a QuickPick. Selecting an entry opens the source document with the
 * link selected. When everything resolves, shows a friendly message instead of
 * an empty picker. This is a one-shot snapshot, not a live view.
 */
export function createShowUnresolvedWikilinksCommand(
  noteIndex: NoteIndex
): () => Promise<void> {
  return async () => {
    await noteIndex.ready();
    const unresolved = noteIndex.getUnresolvedLinks();

    if (unresolved.length === 0) {
      void vscode.window.showInformationMessage('All wikilinks resolve.');
      return;
    }

    const items = buildUnresolvedLinkItems(unresolved);
    const count = unresolved.length;
    const picked = await vscode.window.showQuickPick(items, {
      title: `Unresolved Wikilinks (${count})`,
      placeHolder: `${count} unresolved ${
        count === 1 ? 'wikilink' : 'wikilinks'
      } — select one to open its source`,
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (!picked) {
      return;
    }

    const { sourceUri, range } = picked.link;
    await vscode.window.showTextDocument(sourceUri, {
      preview: false,
      selection: range
    });
  };
}
