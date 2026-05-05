import * as vscode from 'vscode';
import { NoteIndex } from '../index/noteIndex';

export async function resolveWikiLinkTarget(
  index: NoteIndex,
  target: string,
  fromUri: vscode.Uri
): Promise<vscode.Uri | null> {
  await index.ready();
  return index.resolve(target, fromUri);
}
