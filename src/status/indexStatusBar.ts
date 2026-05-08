import * as vscode from 'vscode';
import { NoteIndex } from '../index/noteIndex';

export class IndexStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(noteIndex: NoteIndex) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'markdownLoom.showIndexStatus';
    this.item.tooltip = 'Markdown Loom index — click for details';

    this.disposables.push(
      noteIndex.onWillRebuildIndex(() => this.showIndexing()),
      noteIndex.onDidChangeIndex(() => this.updateFromIndex(noteIndex))
    );

    this.showIndexing();
    this.item.show();
  }

  private showIndexing(): void {
    this.item.text = '$(loading~spin) Loom: indexing\u2026';
  }

  private updateFromIndex(noteIndex: NoteIndex): void {
    const count = noteIndex.getNotes().length;
    this.item.text = `$(file) Loom: ${count} note${count === 1 ? '' : 's'}`;
  }

  dispose(): void {
    this.item.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
