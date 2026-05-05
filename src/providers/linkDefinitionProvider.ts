import * as vscode from 'vscode';
import { NoteIndex } from '../index/noteIndex';
import { findWikiLinkAtPosition, isInsideFencedCodeBlock } from './linkParsing';
import { resolveWikiLinkTarget } from './linkResolution';

export class WikiLinkDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly index: NoteIndex) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Location | null> {
    if (isInsideFencedCodeBlock(document, position)) {
      return null;
    }

    const match = findWikiLinkAtPosition(document, position);
    if (!match) {
      return null;
    }

    const target = await resolveWikiLinkTarget(this.index, match.target, document.uri);
    if (!target) {
      return null;
    }

    return new vscode.Location(target, new vscode.Position(0, 0));
  }
}
