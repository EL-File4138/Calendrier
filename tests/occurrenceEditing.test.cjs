const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/utils/sessionSchedule.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const source = { exports: {} };
new Function('module', 'exports', code)(source, source.exports);
const { resolveSessionForDate, consolidateSession, skipSessionOccurrence, moveSessionOccurrence } = source.exports;
const base = { id: 'session', meetDay: 'Monday', startTime: '10:00', endTime: '11:30' };
const resolve = (session, date) => resolveSessionForDate(session, new Date(`${date}T12:00:00`));

test('unbounded consolidation deduplicates equal overrides and moves back to the base slot', () => {
  const changed = { ...base, schedule: { mode: 'weekly', overrides: {
    '2026-10-05': { moveToDate: '2026-10-06', startTime: '12:00', endTime: '13:30' },
    '2026-10-12': { moveToDate: '2026-10-13', startTime: '12:00', endTime: '13:30' },
    '2026-10-19': { moveToDate: '2026-10-19', startTime: '10:00', endTime: '11:30' },
  } } };
  assert.equal(consolidateSession(changed).length, 2);
});

test('skipping an unbounded weekly occurrence preserves earlier and later weeks and round-trips', () => {
  const changed = JSON.parse(JSON.stringify(skipSessionOccurrence(base, '2026-10-05')));
  assert.equal(resolve(changed, '2026-10-05'), null);
  assert.ok(resolve(changed, '2026-09-28'));
  assert.ok(resolve(changed, '2026-10-12'));
  assert.equal(base.schedule, undefined);
  assert.equal(skipSessionOccurrence(changed, '2026-10-05').schedule.excludedDates.length, 1);
  assert.ok(consolidateSession(changed).length);
});

test('a move preserves duration, base timetable, and original source on a second move and skip', () => {
  const occurrence = resolve(base, '2026-10-05');
  const changed = moveSessionOccurrence(base, occurrence, '2026-10-06', '12:15');
  assert.equal(resolve(changed, '2026-10-05'), null);
  const moved = resolve(changed, '2026-10-06');
  assert.equal(moved.startTime, '12:15');
  assert.equal(moved.endTime, '13:45');
  assert.equal(moved.sourceDate, '2026-10-05');
  assert.equal(resolve(changed, '2026-10-12').startTime, '10:00');
  const again = moveSessionOccurrence(changed, moved, '2026-10-07', '09:00');
  assert.deepEqual(Object.keys(again.schedule.overrides), ['2026-10-05']);
  assert.equal(resolve(again, '2026-10-06'), null);
  assert.equal(resolve(skipSessionOccurrence(again, '2026-10-05'), '2026-10-07'), null);
});

test('bounded intervals, exclusions and other override fields are preserved', () => {
  const session = { ...base, schedule: { mode: 'bounded', startDate: '2026-10-05', endDate: '2026-11-30', intervalWeeks: 2, excludedDates: ['2026-11-02'], overrides: { '2026-10-19': { location: 'Room B', instructor: 'Teacher' } } } };
  const changed = moveSessionOccurrence(session, resolve(session, '2026-10-19'), '2026-10-20', '08:00');
  assert.equal(resolve(changed, '2026-10-12'), null);
  assert.equal(resolve(changed, '2026-11-02'), null);
  assert.equal(resolve(changed, '2026-12-14'), null);
  assert.equal(resolve(changed, '2026-10-20').location, 'Room B');
  assert.equal(resolve(changed, '2026-10-20').instructor, 'Teacher');
  assert.equal(session.schedule.overrides['2026-10-19'].moveToDate, undefined);
});

test('one-off occurrence can be moved and skipped without becoming recurring', () => {
  const once = { ...base, schedule: { mode: 'once', startDate: '2026-10-05' } };
  const changed = moveSessionOccurrence(once, resolve(once, '2026-10-05'), '2026-10-09', '14:00');
  assert.ok(resolve(changed, '2026-10-09'));
  assert.equal(resolve(changed, '2026-10-16'), null);
  assert.equal(resolve(skipSessionOccurrence(changed, '2026-10-05'), '2026-10-09'), null);
});

test('a skipped moved occurrence does not hide a later move to the same date', () => {
  const moved = moveSessionOccurrence(base, resolve(base, '2026-10-05'), '2026-10-06', '12:00');
  const skipped = skipSessionOccurrence(moved, '2026-10-05');
  const changed = moveSessionOccurrence(skipped, resolve(skipped, '2026-10-12'), '2026-10-06', '09:00');
  assert.equal(resolve(changed, '2026-10-06').sourceDate, '2026-10-12');
  assert.equal(resolve(changed, '2026-10-06').startTime, '09:00');
});

test('moving onto another occurrence or past midnight is rejected', () => {
  const occurrence = resolve(base, '2026-10-05');
  assert.throws(() => moveSessionOccurrence(base, occurrence, '2026-10-12', '12:00'), /moveConflict/);
  assert.throws(() => moveSessionOccurrence(base, occurrence, '2026-10-06', '23:00'), /invalidMove/);
  assert.throws(() => moveSessionOccurrence(base, occurrence, '2026-02-30', '12:00'), /invalidMove/);
  assert.throws(() => moveSessionOccurrence(base, occurrence, '2026-10-06', '25:00'), /invalidMove/);
});
