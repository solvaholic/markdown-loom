import * as assert from 'assert';
import {
  parseTaskLine,
  hasDoneDate,
  isCompletedStatus,
  extractTags
} from '../../tasks/parser';
import { toggleTaskLine } from '../../tasks/toggler';

suite('Task Parser Tests', () => {
  test('parses a basic open task', () => {
    const parsed = parseTaskLine('- [ ] Buy milk');
    assert.ok(parsed);
    assert.strictEqual(parsed!.indentation, '');
    assert.strictEqual(parsed!.listMarker, '-');
    assert.strictEqual(parsed!.status, ' ');
    assert.strictEqual(parsed!.description, 'Buy milk');
  });

  test('parses an indented numbered task', () => {
    const parsed = parseTaskLine('  1. [x] Done thing');
    assert.ok(parsed);
    assert.strictEqual(parsed!.indentation, '  ');
    assert.strictEqual(parsed!.listMarker, '1.');
    assert.strictEqual(parsed!.status, 'x');
    assert.strictEqual(parsed!.description, 'Done thing');
  });

  test('returns null for non-task lines', () => {
    assert.strictEqual(parseTaskLine('Not a task'), null);
    assert.strictEqual(parseTaskLine('- a list item'), null);
    assert.strictEqual(parseTaskLine('# heading'), null);
  });

  test('detects completed status', () => {
    assert.strictEqual(isCompletedStatus('x'), true);
    assert.strictEqual(isCompletedStatus('X'), true);
    assert.strictEqual(isCompletedStatus(' '), false);
    assert.strictEqual(isCompletedStatus('/'), false);
  });

  test('hasDoneDate matches ✅ YYYY-MM-DD', () => {
    assert.strictEqual(hasDoneDate('Read book ✅ 2026-05-05'), true);
    assert.strictEqual(hasDoneDate('Read book'), false);
  });

  test('extractTags pulls hash tags', () => {
    const tags = extractTags('walk the dog #pet #daily');
    assert.deepStrictEqual(tags, ['#pet', '#daily']);
  });
});

suite('Task Toggler Tests', () => {
  const today = '2026-05-05';
  const opts = {
    autoAddDoneDate: true,
    stripDoneDateOnReopen: true,
    today
  };

  test('toggle open -> done appends done date', () => {
    const result = toggleTaskLine('- [ ] Buy milk', opts);
    assert.ok(result);
    assert.strictEqual(result!.becameDone, true);
    assert.strictEqual(result!.newLine, `- [x] Buy milk ✅ ${today}`);
  });

  test('toggle done -> open strips auto done date', () => {
    const result = toggleTaskLine(`- [x] Buy milk ✅ ${today}`, opts);
    assert.ok(result);
    assert.strictEqual(result!.becameDone, false);
    assert.strictEqual(result!.newLine, '- [ ] Buy milk');
  });

  test('preserves trailing emoji and tags through toggle', () => {
    const line = '- [ ] Review [[Doc]] ⏳ 2026-02-15 🔁 every week #work';
    const done = toggleTaskLine(line, opts);
    assert.ok(done);
    assert.strictEqual(
      done!.newLine,
      `- [x] Review [[Doc]] ⏳ 2026-02-15 🔁 every week #work ✅ ${today}`
    );
    const reopened = toggleTaskLine(done!.newLine, opts);
    assert.ok(reopened);
    assert.strictEqual(
      reopened!.newLine,
      '- [ ] Review [[Doc]] ⏳ 2026-02-15 🔁 every week #work'
    );
  });

  test('does not duplicate an existing done date', () => {
    const line = `- [ ] Already stamped ✅ 2026-04-30`;
    const result = toggleTaskLine(line, opts);
    assert.ok(result);
    assert.strictEqual(result!.newLine, '- [x] Already stamped ✅ 2026-04-30');
  });

  test('respects autoAddDoneDate=false', () => {
    const result = toggleTaskLine('- [ ] No stamp', {
      ...opts,
      autoAddDoneDate: false,
      stripDoneDateOnReopen: false
    });
    assert.ok(result);
    assert.strictEqual(result!.newLine, '- [x] No stamp');
  });

  test('returns null for non-task lines', () => {
    assert.strictEqual(toggleTaskLine('Plain text', opts), null);
  });

  test('preserves indentation and list marker', () => {
    const result = toggleTaskLine('  + [ ] Indented', opts);
    assert.ok(result);
    assert.strictEqual(result!.newLine, `  + [x] Indented ✅ ${today}`);
  });
});
