import * as path from 'path';
import * as vscode from 'vscode';
import { NoteIndex } from '../index/noteIndex';

/**
 * Register an `onWillRenameFiles` participant that rewrites inbound
 * `[[OldName]]` wikilinks to `[[NewName]]` atomically with the file rename.
 *
 * The returned edit is merged into VS Code's rename operation, so the whole
 * thing (file move + text edits) is a single undo step.
 */
export function createRenameParticipant(
  index: NoteIndex
): vscode.Disposable {
  return vscode.workspace.onWillRenameFiles((event) => {
    event.waitUntil(buildRenameEdits(index, event.files));
  });
}

async function buildRenameEdits(
  index: NoteIndex,
  files: ReadonlyArray<{ readonly oldUri: vscode.Uri; readonly newUri: vscode.Uri }>
): Promise<vscode.WorkspaceEdit> {
  const edit = new vscode.WorkspaceEdit();

  for (const { oldUri, newUri } of files) {
    if (!isMarkdown(oldUri) || !isMarkdown(newUri)) {
      continue;
    }

    await index.ready();

    const oldBasename = basenameNoExt(oldUri);
    const newBasename = basenameNoExt(newUri);

    if (oldBasename.toLowerCase() === newBasename.toLowerCase()) {
      // Casing-only rename or same name — no link text changes needed.
      // (VS Code still renames the file; we just have no text to rewrite.)
      continue;
    }

    const inbound = index.getLinksTo(oldBasename);

    for (const { sourceUri, links } of inbound) {
      // Open the document so we can read the exact wikilink text at each range.
      const doc = await vscode.workspace.openTextDocument(sourceUri);

      for (const link of links) {
        const fullText = doc.getText(link.range);
        // fullText is e.g. `[[Foo]]`, `[[Foo#H]]`, `[[Foo|A]]`, `[[foo#H|A]]`
        const replaced = rewriteWikiLink(fullText, oldBasename, newBasename);
        if (replaced !== null) {
          edit.replace(sourceUri, link.range, replaced);
        }
      }
    }
  }

  return edit;
}

/**
 * Given the full text of a wikilink (including brackets), replace the note
 * name while preserving any `#section` and `|alias`.
 *
 * Returns `null` if the text doesn't look like a valid wikilink (defensive).
 */
function rewriteWikiLink(
  fullText: string,
  _oldBasename: string,
  newBasename: string
): string | null {
  // Strip outer [[ and ]]
  if (!fullText.startsWith('[[') || !fullText.endsWith(']]')) {
    return null;
  }
  const body = fullText.slice(2, -2);

  // Split alias first (first `|`), then section (first `#` in target part).
  const pipeIdx = body.indexOf('|');
  const targetPart = pipeIdx === -1 ? body : body.slice(0, pipeIdx);
  const aliasPart = pipeIdx === -1 ? '' : body.slice(pipeIdx); // includes `|`

  const hashIdx = targetPart.indexOf('#');
  const sectionPart = hashIdx === -1 ? '' : targetPart.slice(hashIdx); // includes `#`

  // Reconstruct: [[newBasename#section|alias]]
  return `[[${newBasename}${sectionPart}${aliasPart}]]`;
}

function isMarkdown(uri: vscode.Uri): boolean {
  return /\.md$/i.test(uri.fsPath);
}

function basenameNoExt(uri: vscode.Uri): string {
  const base = path.basename(uri.fsPath);
  return base.replace(/\.md$/i, '');
}
