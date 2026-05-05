import * as path from 'path';
import * as vscode from 'vscode';
import { BacklinkLocation, NoteIndex, uriKey } from '../index/noteIndex';

type BacklinkNode = RootNode | FileNode | MatchNode;

interface RootNode {
  kind: 'root';
  count: number;
}

interface FileNode {
  kind: 'file';
  sourceUri: vscode.Uri;
  matches: BacklinkLocation[];
}

interface MatchNode {
  kind: 'match';
  match: BacklinkLocation;
}

const REFRESH_DEBOUNCE_MS = 100;

export class BacklinksProvider
  implements vscode.TreeDataProvider<BacklinkNode>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly disposables: vscode.Disposable[] = [];
  private debounceHandle: NodeJS.Timeout | undefined;
  private cached: { activeKey: string | null; matches: BacklinkLocation[] } = {
    activeKey: null,
    matches: []
  };

  constructor(private readonly index: NoteIndex) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
      this.index.onDidChangeIndex(() => this.scheduleRefresh())
    );
    this.scheduleRefresh();
  }

  dispose(): void {
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this._onDidChangeTreeData.dispose();
  }

  private scheduleRefresh(): void {
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }
    this.debounceHandle = setTimeout(() => {
      this.debounceHandle = undefined;
      this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  private refresh(): void {
    const editor = vscode.window.activeTextEditor;
    const doc = editor?.document;
    if (!doc || doc.languageId !== 'markdown' || doc.uri.scheme !== 'file') {
      this.cached = { activeKey: null, matches: [] };
    } else {
      this.cached = {
        activeKey: uriKey(doc.uri),
        matches: this.index.getBacklinks(doc.uri)
      };
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node: BacklinkNode): vscode.TreeItem {
    if (node.kind === 'root') {
      const item = new vscode.TreeItem(
        `Referenced in ${node.count} ${node.count === 1 ? 'note' : 'notes'}`,
        node.count > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None
      );
      item.contextValue = 'markdownLoom.backlinkRoot';
      return item;
    }
    if (node.kind === 'file') {
      const label = path.basename(node.sourceUri.fsPath);
      const item = new vscode.TreeItem(
        label,
        vscode.TreeItemCollapsibleState.Expanded
      );
      const count = node.matches.length;
      const ambiguousCount = node.matches.filter((m) => m.ambiguous).length;
      let description = `${count} ${count === 1 ? 'match' : 'matches'}`;
      if (ambiguousCount === count && count > 0) {
        description += ' · ambiguous';
      } else if (ambiguousCount > 0) {
        description += ` · ${ambiguousCount} ambiguous`;
      }
      item.description = description;
      item.resourceUri = node.sourceUri;
      item.tooltip = vscode.workspace.asRelativePath(node.sourceUri, true);
      item.contextValue = 'markdownLoom.backlinkFile';
      return item;
    }
    const { match } = node;
    const lineNumber = match.range.start.line + 1;
    const item = new vscode.TreeItem(
      `${lineNumber}: ${truncate(match.preview, 120)}`,
      vscode.TreeItemCollapsibleState.None
    );
    if (match.ambiguous) {
      item.description = 'ambiguous';
      item.iconPath = new vscode.ThemeIcon('warning');
      item.tooltip =
        `${match.preview}\n\n` +
        '⚠ This bare wikilink matches multiple notes. ' +
        'Navigation picks one winner via the same-folder tiebreaker, ' +
        'but every candidate gets this backlink so collisions surface here.';
    } else {
      item.tooltip = match.preview;
    }
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [
        match.sourceUri,
        { selection: match.range, preserveFocus: false }
      ]
    };
    item.contextValue = 'markdownLoom.backlinkMatch';
    return item;
  }

  getChildren(node?: BacklinkNode): BacklinkNode[] {
    if (!node) {
      const grouped = groupBySource(this.cached.matches);
      return [{ kind: 'root', count: grouped.length }];
    }
    if (node.kind === 'root') {
      return groupBySource(this.cached.matches).map((file) => ({
        kind: 'file' as const,
        sourceUri: file.sourceUri,
        matches: file.matches
      }));
    }
    if (node.kind === 'file') {
      return node.matches.map((match) => ({ kind: 'match' as const, match }));
    }
    return [];
  }
}

function groupBySource(
  matches: BacklinkLocation[]
): { sourceUri: vscode.Uri; matches: BacklinkLocation[] }[] {
  const map = new Map<string, { sourceUri: vscode.Uri; matches: BacklinkLocation[] }>();
  for (const match of matches) {
    const key = uriKey(match.sourceUri);
    let entry = map.get(key);
    if (!entry) {
      entry = { sourceUri: match.sourceUri, matches: [] };
      map.set(key, entry);
    }
    entry.matches.push(match);
  }
  for (const entry of map.values()) {
    entry.matches.sort((a, b) => a.range.start.compareTo(b.range.start));
  }
  return Array.from(map.values()).sort((a, b) =>
    path.basename(a.sourceUri.fsPath).localeCompare(path.basename(b.sourceUri.fsPath))
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
