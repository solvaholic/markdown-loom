import * as vscode from 'vscode';
import { isInsideFencedCodeBlock } from '../providers/linkParsing';
import { toggleTaskLine, todayIso } from './toggler';

export function createToggleTaskCommand(): () => Promise<void> {
  return async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
      return;
    }
    const document = editor.document;
    const config = vscode.workspace.getConfiguration(
      'markdownLoom',
      document.uri
    );
    const autoAddDoneDate = config.get<boolean>('autoAddDoneDate', true);

    await editor.edit((edit) => {
      const seenLines = new Set<number>();
      for (const selection of editor.selections) {
        for (
          let lineNumber = selection.start.line;
          lineNumber <= selection.end.line;
          lineNumber += 1
        ) {
          if (seenLines.has(lineNumber)) {
            continue;
          }
          seenLines.add(lineNumber);
          const linePos = new vscode.Position(lineNumber, 0);
          if (isInsideFencedCodeBlock(document, linePos)) {
            continue;
          }
          const lineText = document.lineAt(lineNumber).text;
          const result = toggleTaskLine(lineText, {
            autoAddDoneDate,
            stripDoneDateOnReopen: autoAddDoneDate,
            today: todayIso()
          });
          if (!result) {
            continue;
          }
          const fullLineRange = document.lineAt(lineNumber).range;
          edit.replace(fullLineRange, result.newLine);
        }
      }
    });
  };
}
