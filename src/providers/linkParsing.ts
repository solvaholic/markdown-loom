import * as vscode from 'vscode';

export interface WikiLinkMatch {
  raw: string;
  /** Bare note basename (before `#` and `|`). */
  target: string;
  /** Section (heading) reference — text after `#` and before `|`, or null. */
  section: string | null;
  /** Display text - alias when present, otherwise the full target (note#heading or note). */
  display: string;
  range: vscode.Range;
}

const fencedCodeBlockPattern = /(^|\n)(```|~~~)/g;
const wikilinkPattern = /\[\[([^\]]+)\]\]/g;

/**
 * Split `Target#Section|Alias` into `{ target, section, display }`.
 *
 * - The first `#` (if any) separates the note basename from the section ref.
 * - The first `|` (if any) separates the display alias from the rest.
 * - An empty note basename makes the match invalid (caller should drop it).
 * - Path separators in the note basename are illegal per docs/SPEC.md
 *   "Wikilink target syntax" — return null for those.
 */
export function parseWikiLinkBody(
  body: string
): { target: string; section: string | null; display: string } | null {
  const pipeIdx = body.indexOf('|');
  const targetPart = (pipeIdx === -1 ? body : body.slice(0, pipeIdx)).trim();
  if (!targetPart) {
    return null;
  }

  // Split note basename from optional section ref on the first `#`.
  const hashIdx = targetPart.indexOf('#');
  const noteName = (hashIdx === -1 ? targetPart : targetPart.slice(0, hashIdx)).trim();
  const section =
    hashIdx === -1 ? null : targetPart.slice(hashIdx + 1).trim() || null;

  if (!noteName) {
    return null;
  }
  // Per docs/SPEC.md "Wikilink target syntax": only bare basenames are
  // legal. Path separators or relative-path prefixes mean this is not a
  // wikilink at all - leave it as plain text.
  if (noteName.includes('/') || noteName.includes('\\')) {
    return null;
  }

  const aliasRaw = pipeIdx === -1 ? '' : body.slice(pipeIdx + 1).trim();
  // When no alias is given, display the full target part (note#heading or just
  // the note name). Build it explicitly so we never emit a trailing bare `#`
  // (e.g. for the degenerate `[[Note#]]` form where section parsed to null).
  const display = aliasRaw || (section ? `${noteName}#${section}` : noteName);
  return { target: noteName, section, display };
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
      section: parsed.section,
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
