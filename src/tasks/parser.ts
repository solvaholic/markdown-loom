// Portions of this file are adapted from the Obsidian Tasks project,
// licensed under the MIT License. See LICENSES/obsidian-tasks.MIT.txt
// for the full notice.
//
// Source:
//   https://github.com/obsidian-tasks-group/obsidian-tasks
//   src/Task/TaskRegularExpressions.ts (MIT)
//
// We re-use the indentation, list-marker, checkbox, after-checkbox, and
// hash-tag regular expressions, and the composed task-line regex.

export const taskRegExpressions = {
  // Matches indentation before a list marker (including > for blockquotes / callouts)
  indentation: /^([\s\t>]*)/,

  // Matches - * + list markers, or numbered list markers like 1. and 1)
  listMarker: /([-*+]|[0-9]+[.)])/,

  // Matches a checkbox and captures the status character inside.
  checkbox: /\[(.)\]/u,

  // Matches the rest of the task after the checkbox.
  afterCheckbox: / *(.*)/u,

  // Matches all hash tags in a description.
  hashTags: /(^|\s)#[^ !@#$%^&*(),.?":{}|<>]+/g
} as const;

export const taskLineRegex = new RegExp(
  taskRegExpressions.indentation.source +
    taskRegExpressions.listMarker.source +
    ' +' +
    taskRegExpressions.checkbox.source +
    taskRegExpressions.afterCheckbox.source,
  'u'
);

export const doneDateRegex = /\s*✅\s*\d{4}-\d{2}-\d{2}/u;

export interface TaskLine {
  indentation: string;
  listMarker: string;
  status: string;
  description: string;
  /** Index in the original line where the description starts. */
  descriptionStart: number;
}

export function parseTaskLine(line: string): TaskLine | null {
  const match = taskLineRegex.exec(line);
  if (!match) {
    return null;
  }
  const [full, indentation, listMarker, status, description] = match;
  const descriptionStart = full.length - (description?.length ?? 0);
  return {
    indentation,
    listMarker,
    status,
    description: description ?? '',
    descriptionStart
  };
}

export function isCompletedStatus(status: string): boolean {
  return status === 'x' || status === 'X';
}

export function hasDoneDate(description: string): boolean {
  return doneDateRegex.test(description);
}

export function extractTags(description: string): string[] {
  const tags: string[] = [];
  taskRegExpressions.hashTags.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = taskRegExpressions.hashTags.exec(description)) !== null) {
    tags.push(match[0].trim());
  }
  return tags;
}
