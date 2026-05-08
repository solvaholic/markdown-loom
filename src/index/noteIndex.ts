import * as vscode from 'vscode';
import { parseWikiLinkBody } from '../providers/linkParsing';

export interface NoteInfo {
  uri: vscode.Uri;
  basename: string;
  workspaceRelativePath: string;
}

export interface RawLink {
  rawTarget: string;
  range: vscode.Range;
  preview: string;
}

export interface BacklinkLocation {
  sourceUri: vscode.Uri;
  range: vscode.Range;
  preview: string;
  /**
   * True when the source link was a bare basename (or unqualified suffix) that
   * matched multiple notes, and this target was *not* the tiebreaker winner.
   * Surfaces filename collisions in the Backlinks panel without affecting
   * navigation (go-to-definition still picks one winner).
   */
  ambiguous: boolean;
}

const wikilinkPattern = /\[\[([^\]]+)\]\]/g;
const fencePattern = /^[ \t]{0,3}(```|~~~)/;

export function uriKey(uri: vscode.Uri): string {
  return uri.scheme === 'file' ? uri.fsPath.toLowerCase() : uri.toString().toLowerCase();
}

export function extractWikiLinksFromText(text: string): RawLink[] {
  const lines = text.split(/\r?\n/);
  const links: RawLink[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fencePattern.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    wikilinkPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = wikilinkPattern.exec(line)) !== null) {
      const parsed = parseWikiLinkBody(match[1]);
      if (!parsed) {
        continue;
      }
      const startCol = match.index;
      const endCol = match.index + match[0].length;
      links.push({
        rawTarget: parsed.target,
        range: new vscode.Range(i, startCol, i, endCol),
        preview: line.trim()
      });
    }
  }
  return links;
}

export class NoteIndex implements vscode.Disposable {
  private readonly notes = new Map<string, NoteInfo>();
  private readonly basenameToKeys = new Map<string, string[]>();
  private readonly sourceLinks = new Map<string, RawLink[]>();
  private readonly backlinks = new Map<string, Map<string, BacklinkLocation[]>>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly _onDidChangeIndex = new vscode.EventEmitter<void>();
  readonly onDidChangeIndex = this._onDidChangeIndex.event;

  private buildPromise: Promise<void> | null = null;
  private generation = 0;
  private includeWorkspaceFolder = false;

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    this.disposables.push(
      watcher,
      watcher.onDidCreate((uri) => this.handleFileTouched(uri, true)),
      watcher.onDidChange((uri) => this.handleFileTouched(uri, false)),
      watcher.onDidDelete((uri) => this.handleFileDeleted(uri)),
      vscode.workspace.onDidRenameFiles((e) => this.handleRenames(e.files)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleRebuild()),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.languageId === 'markdown') {
          this.handleFileTouched(doc.uri, false, doc.getText());
        }
      })
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this._onDidChangeIndex.dispose();
  }

  async ready(): Promise<void> {
    if (!this.buildPromise) {
      this.scheduleRebuild();
    }
    await this.buildPromise;
  }

  scheduleRebuild(): void {
    const myGeneration = ++this.generation;
    this.buildPromise = this.rebuild(myGeneration);
  }

  private async rebuild(myGeneration: number): Promise<void> {
    this.includeWorkspaceFolder =
      (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const files = await vscode.workspace.findFiles('**/*.md');
    if (myGeneration !== this.generation) {
      return;
    }
    this.notes.clear();
    this.basenameToKeys.clear();
    this.sourceLinks.clear();
    this.backlinks.clear();
    for (const file of files) {
      this.registerNote(file);
    }
    await Promise.all(
      files.map(async (file) => {
        if (myGeneration !== this.generation) {
          return;
        }
        const text = await readFileText(file);
        if (myGeneration !== this.generation) {
          return;
        }
        const links = extractWikiLinksFromText(text);
        this.sourceLinks.set(uriKey(file), links);
      })
    );
    if (myGeneration !== this.generation) {
      return;
    }
    this.rebuildBacklinks();
    this._onDidChangeIndex.fire();
  }

  private rebuildBacklinks(): void {
    this.backlinks.clear();
    for (const [sourceKey, links] of this.sourceLinks.entries()) {
      const sourceUri = this.notes.get(sourceKey)?.uri;
      if (!sourceUri) {
        continue;
      }
      for (const link of links) {
        for (const match of this.resolveAll(link.rawTarget, sourceUri)) {
          this.addBacklink(match.uri, sourceUri, link, match.ambiguous);
        }
      }
    }
  }

  private addBacklink(
    targetUri: vscode.Uri,
    sourceUri: vscode.Uri,
    link: RawLink,
    ambiguous: boolean
  ): void {
    const targetKey = uriKey(targetUri);
    const sourceKey = uriKey(sourceUri);
    let perSource = this.backlinks.get(targetKey);
    if (!perSource) {
      perSource = new Map();
      this.backlinks.set(targetKey, perSource);
    }
    let locations = perSource.get(sourceKey);
    if (!locations) {
      locations = [];
      perSource.set(sourceKey, locations);
    }
    locations.push({
      sourceUri,
      range: link.range,
      preview: link.preview,
      ambiguous
    });
  }

  private removeSourceFromBacklinks(sourceKey: string): void {
    for (const [targetKey, perSource] of this.backlinks) {
      if (perSource.delete(sourceKey) && perSource.size === 0) {
        this.backlinks.delete(targetKey);
      }
    }
  }

  private registerNote(uri: vscode.Uri): void {
    const relativePath = this.getRelativePath(uri);
    const pathWithoutExt = relativePath.replace(/\.md$/i, '');
    const basename = pathWithoutExt.split('/').pop() ?? pathWithoutExt;
    const key = uriKey(uri);
    this.notes.set(key, {
      uri,
      basename,
      workspaceRelativePath: pathWithoutExt
    });
    const basenameLower = basename.toLowerCase();
    const list = this.basenameToKeys.get(basenameLower) ?? [];
    list.push(key);
    this.basenameToKeys.set(basenameLower, list);
  }

  private unregisterNote(key: string): void {
    const note = this.notes.get(key);
    if (!note) {
      return;
    }
    this.notes.delete(key);
    const basenameLower = note.basename.toLowerCase();
    const list = this.basenameToKeys.get(basenameLower);
    if (list) {
      const filtered = list.filter((k) => k !== key);
      if (filtered.length) {
        this.basenameToKeys.set(basenameLower, filtered);
      } else {
        this.basenameToKeys.delete(basenameLower);
      }
    }
  }

  private async handleFileTouched(
    uri: vscode.Uri,
    isCreate: boolean,
    knownText?: string
  ): Promise<void> {
    if (!this.buildPromise) {
      this.scheduleRebuild();
      return;
    }
    await this.buildPromise;
    const key = uriKey(uri);
    const wasIndexed = this.notes.has(key);
    if (isCreate || !wasIndexed) {
      this.registerNote(uri);
    }
    const text = knownText ?? (await readFileText(uri));
    const links = extractWikiLinksFromText(text);
    this.sourceLinks.set(key, links);
    if (isCreate || !wasIndexed) {
      this.rebuildBacklinks();
    } else {
      this.removeSourceFromBacklinks(key);
      const sourceUri = this.notes.get(key)?.uri ?? uri;
      for (const link of links) {
        for (const match of this.resolveAll(link.rawTarget, sourceUri)) {
          this.addBacklink(match.uri, sourceUri, link, match.ambiguous);
        }
      }
    }
    this._onDidChangeIndex.fire();
  }

  private async handleFileDeleted(uri: vscode.Uri): Promise<void> {
    if (!this.buildPromise) {
      this.scheduleRebuild();
      return;
    }
    await this.buildPromise;
    const key = uriKey(uri);
    if (!this.notes.has(key)) {
      return;
    }
    this.unregisterNote(key);
    this.sourceLinks.delete(key);
    this.removeSourceFromBacklinks(key);
    this.rebuildBacklinks();
    this._onDidChangeIndex.fire();
  }

  private async handleRenames(
    files: readonly { readonly oldUri: vscode.Uri; readonly newUri: vscode.Uri }[]
  ): Promise<void> {
    let touched = false;
    for (const { oldUri, newUri } of files) {
      if (!isMarkdown(oldUri) && !isMarkdown(newUri)) {
        continue;
      }
      touched = true;
      if (isMarkdown(oldUri)) {
        await this.handleFileDeleted(oldUri);
      }
      if (isMarkdown(newUri)) {
        await this.handleFileTouched(newUri, true);
      }
    }
    if (touched) {
      this._onDidChangeIndex.fire();
    }
  }

  resolve(target: string, fromUri: vscode.Uri): vscode.Uri | null {
    const targetLower = normalizeTarget(target);
    if (!targetLower) {
      return null;
    }
    const candidateKeys = this.basenameToKeys.get(targetLower);
    if (!candidateKeys || candidateKeys.length === 0) {
      return null;
    }
    return this.pickBestCandidate(candidateKeys, fromUri);
  }

  /**
   * Resolve a wikilink target to *every* candidate note. The tiebreaker winner
   * is marked `ambiguous: false`; other candidates are marked `ambiguous: true`.
   * Used by the backlinks index so filename collisions surface as backlinks
   * on every conflicting note, not just the navigation winner.
   */
  resolveAll(
    target: string,
    fromUri: vscode.Uri
  ): { uri: vscode.Uri; ambiguous: boolean }[] {
    const targetLower = normalizeTarget(target);
    if (!targetLower) {
      return [];
    }
    const basenameKeys = this.basenameToKeys.get(targetLower);
    if (basenameKeys && basenameKeys.length > 0) {
      return this.expandCandidates(basenameKeys, fromUri);
    }
    return [];
  }

  private expandCandidates(
    keys: string[],
    fromUri: vscode.Uri
  ): { uri: vscode.Uri; ambiguous: boolean }[] {
    if (keys.length === 1) {
      const uri = this.notes.get(keys[0])?.uri;
      return uri ? [{ uri, ambiguous: false }] : [];
    }
    const winner = this.pickBestCandidate(keys, fromUri);
    const winnerKey = winner ? uriKey(winner) : null;
    const out: { uri: vscode.Uri; ambiguous: boolean }[] = [];
    for (const key of keys) {
      const uri = this.notes.get(key)?.uri;
      if (!uri) {
        continue;
      }
      out.push({ uri, ambiguous: key !== winnerKey });
    }
    return out;
  }

  private pickBestCandidate(
    candidateKeys: string[],
    fromUri: vscode.Uri
  ): vscode.Uri | null {
    if (candidateKeys.length === 1) {
      return this.notes.get(candidateKeys[0])?.uri ?? null;
    }
    const currentFolder = vscode.workspace.getWorkspaceFolder(fromUri);
    const currentPrefix = currentFolder ? `${currentFolder.name}/`.toLowerCase() : '';
    let best: string | null = null;
    let bestPreferred = false;
    for (const key of candidateKeys) {
      const note = this.notes.get(key);
      if (!note) {
        continue;
      }
      const preferred =
        currentPrefix.length > 0 &&
        note.workspaceRelativePath.toLowerCase().startsWith(currentPrefix);
      if (best === null || (preferred && !bestPreferred)) {
        best = key;
        bestPreferred = preferred;
      }
    }
    return best ? this.notes.get(best)?.uri ?? null : null;
  }

  getNotes(): NoteInfo[] {
    return Array.from(this.notes.values());
  }

  getBacklinks(targetUri: vscode.Uri): BacklinkLocation[] {
    const perSource = this.backlinks.get(uriKey(targetUri));
    if (!perSource) {
      return [];
    }
    const all: BacklinkLocation[] = [];
    for (const locations of perSource.values()) {
      all.push(...locations);
    }
    return all;
  }

  isMultiRoot(): boolean {
    return this.includeWorkspaceFolder;
  }

  private getRelativePath(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return uri.fsPath;
    }
    return vscode.workspace.asRelativePath(uri, this.includeWorkspaceFolder);
  }
}

function isMarkdown(uri: vscode.Uri): boolean {
  return /\.md$/i.test(uri.fsPath);
}

/**
 * Normalize a wikilink target for basename lookup: strip alias, drop a
 * trailing `.md`, lowercase. Returns null if the target is empty or contains
 * a path separator (illegal per docs/SPEC.md "Wikilink target syntax").
 */
function normalizeTarget(target: string): string | null {
  const pipeIdx = target.indexOf('|');
  const head = (pipeIdx === -1 ? target : target.slice(0, pipeIdx)).trim();
  if (!head || head.includes('/') || head.includes('\\')) {
    return null;
  }
  return head.replace(/\.md$/i, '').toLowerCase();
}

async function readFileText(uri: vscode.Uri): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}
