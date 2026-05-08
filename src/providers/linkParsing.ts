import * as vscode from 'vscode';

export interface WikiLinkMatch {
  raw: string;
  /** Resolution target (the part before `|`, no `.md` suffix stripping). */
  target: string;
  /** Display text - alias when present, otherwise the target. */
  display: string;
  range: vscode.Range;
}

const fencedCodeBlockPattern = /(^|\n)(```|~~~)/g;
const wikilinkPattern = /\[\[([^\]]+)\]\]/g;

/**
 * Split `Target|Alias` into `{ target, display }`. Anything after the first
 * `|` is treated as alias text. Trims both halves; an empty target makes the
 * match invalid (caller should drop it).
 */
export function parseWikiLinkBody(
  body: string
): { target: string; display: string } | null {
  const pipeIdx = body.indexOf('|');
  const rawTarget = (pipeIdx === -1 ? body : body.slice(0, pipeIdx)).trim();
  if (!rawTarget) {
    return null;
  }
  // Per docs/SPEC.md "Wikilink target syntax": only bare basenames are
  // legal. Path separators or relative-path prefixes mean this is not a
  // wikilink at all - leave it as plain text.
  if (rawTarget.includes('/') || rawTarget.includes('\\')) {
    return null;
  }
  const aliasRaw = pipeIdx === -1 ? '' : body.slice(pipeIdx + 1).trim();
  const display = aliasRaw || rawTarget;
  return { target: rawTarget, display };
}

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
    const parsed = parseWikiLinkBody(match[1]);
    if (!parsed) {
      continue;
    }
    const startPos = new vscode.Position(line, match.index);
    const endPos = new vscode.Position(line, match.index + raw.length);
    matches.push({
      raw,
      target: parsed.target,
      display: parsed.display,
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
