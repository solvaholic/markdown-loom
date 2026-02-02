import * as vscode from 'vscode';

export interface WikiLinkMatch {
  raw: string;
  target: string;
  range: vscode.Range;
}

const fencedCodeBlockPattern = /(^|\n)(```|~~~)/g;
const wikilinkPattern = /\[\[([^\]]+)\]\]/g;

export function findWikiLinkAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): WikiLinkMatch | null {
  const lineText = document.lineAt(position.line).text;
  const matches = matchWikiLinks(lineText, position.line);
  const lineMatch = matches.find((match) => match.range.contains(position));

  if (!lineMatch) {
    return null;
  }

  if (isInsideFencedCodeBlock(document, position)) {
    return null;
  }

  return lineMatch;
}

export function matchWikiLinks(text: string, line: number): WikiLinkMatch[] {
  const matches: WikiLinkMatch[] = [];
  let match: RegExpExecArray | null;

  wikilinkPattern.lastIndex = 0;
  while ((match = wikilinkPattern.exec(text)) !== null) {
    const raw = match[0];
    const target = match[1].trim();
    if (!target) {
      continue;
    }
    const startPos = new vscode.Position(line, match.index);
    const endPos = new vscode.Position(line, match.index + raw.length);
    matches.push({
      raw,
      target,
      range: new vscode.Range(startPos, endPos)
    });
  }

  return matches;
}

export function isInsideFencedCodeBlock(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  const text = document.getText();
  const offset = document.offsetAt(position);
  let match: RegExpExecArray | null;
  let fenceCount = 0;
  fencedCodeBlockPattern.lastIndex = 0;
  while ((match = fencedCodeBlockPattern.exec(text)) !== null) {
    if (match.index >= offset) {
      break;
    }
    fenceCount += 1;
  }
  return fenceCount % 2 === 1;
}
