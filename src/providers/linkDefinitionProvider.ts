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

    // When a section ref is present, navigate to the target line.
    // - `#^id` → block reference: look up the block id (case-insensitive).
    // - `#Heading` → heading reference: slug-match against indexed headings.
    // Fall back to line 0 when not found (no hard error — per docs/SPEC.md
    // "missing-heading fallback", same policy applied to missing block ids).
    let line = 0;
    if (match.section) {
      if (match.section.startsWith('^')) {
        const id = match.section.slice(1);
        line = this.index.findBlockIdLine(target, id) ?? 0;
      } else {
        line = this.index.findHeadingLine(target, match.section) ?? 0;
      }
    }

    return new vscode.Location(target, new vscode.Position(line, 0));
  }
}
