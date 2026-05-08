import * as vscode from 'vscode';
import { NoteIndex } from '../index/noteIndex';

export function createShowIndexStatusCommand(noteIndex: NoteIndex): {
  handler: () => void;
  dispose: () => void;
} {
  let channel: vscode.OutputChannel | undefined;

  const handler = (): void => {
    if (!channel) {
      channel = vscode.window.createOutputChannel('Markdown Loom Index');
    }
    channel.clear();

    const folders = vscode.workspace.workspaceFolders ?? [];
    const mode = noteIndex.isMultiRoot() ? 'multi-root' : 'single-root';
    const folderNames = folders.map((f) => f.name).join(', ') || '(none)';
    const notes = noteIndex
      .getNotes()
      .sort((a, b) => a.workspaceRelativePath.localeCompare(b.workspaceRelativePath));
    const count = notes.length;
    const lastRebuildAt = noteIndex.lastRebuildAt;
    const config = vscode.workspace.getConfiguration('markdownLoom');
    const sampleSize = config.get<number>('indexStatusSampleSize', 10);

    channel.appendLine(`Workspace mode: ${mode}`);
    channel.appendLine(`Folders: ${folderNames}`);
    channel.appendLine(`Note count: ${count}`);
    channel.appendLine(
      `Last rebuild: ${lastRebuildAt ? lastRebuildAt.toLocaleString() : 'not yet'}`
    );

    if (count > 0) {
      const shown = Math.min(sampleSize, count);
      channel.appendLine('');
      channel.appendLine(`Sample paths (first ${shown} of ${count}):`);
      for (const note of notes.slice(0, shown)) {
        channel.appendLine(`  ${note.workspaceRelativePath}`);
      }
    }

    channel.show(true);
  };

  return {
    handler,
    dispose: () => channel?.dispose()
  };
}
