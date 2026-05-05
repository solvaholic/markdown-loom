import {
  doneDateRegex,
  hasDoneDate,
  isCompletedStatus,
  parseTaskLine
} from './parser';

export interface ToggleOptions {
  /** When true and toggling to done, append ✅ YYYY-MM-DD if missing. */
  autoAddDoneDate: boolean;
  /** Strip an existing ✅ YYYY-MM-DD when toggling back to open. */
  stripDoneDateOnReopen: boolean;
  /** Date string to use when stamping done date, e.g. "2026-05-05". */
  today: string;
}

export interface ToggleResult {
  newLine: string;
  becameDone: boolean;
}

export function toggleTaskLine(
  line: string,
  options: ToggleOptions
): ToggleResult | null {
  const parsed = parseTaskLine(line);
  if (!parsed) {
    return null;
  }
  const wasDone = isCompletedStatus(parsed.status);
  const newStatus = wasDone ? ' ' : 'x';

  let description = parsed.description;
  if (!wasDone && options.autoAddDoneDate && !hasDoneDate(description)) {
    description = appendDoneDate(description, options.today);
  } else if (wasDone && options.stripDoneDateOnReopen) {
    description = stripDoneDate(description);
  }

  const head = line.slice(0, parsed.descriptionStart);
  // Replace just the status char inside [ ].
  const newHead = head.replace(/\[(.)\]/u, `[${newStatus}]`);
  return {
    newLine: newHead + description,
    becameDone: !wasDone
  };
}

function appendDoneDate(description: string, today: string): string {
  const trimmedRight = description.replace(/\s+$/u, '');
  const trailingWhitespace = description.slice(trimmedRight.length);
  const separator = trimmedRight.length > 0 ? ' ' : '';
  return `${trimmedRight}${separator}✅ ${today}${trailingWhitespace}`;
}

function stripDoneDate(description: string): string {
  return description.replace(doneDateRegex, '').replace(/\s+$/u, '');
}

export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear().toString().padStart(4, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
