const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadSource(name) {
  const filename = path.resolve(__dirname, '../src/utils', `${name}.ts`);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const requireSource = (specifier) => specifier === '../i18n/config'
    ? { default: { t: (key) => key }, __esModule: true }
    : specifier.startsWith('.') ? loadSource(specifier) : require(specifier);
  new Function('require', 'module', 'exports', code)(requireSource, module, module.exports);
  return module.exports;
}

const { parseICS, mapICSToCalendarData } = loadSource('icsParser');
const { resolveSessionForDate, consolidateSession } = loadSource('sessionSchedule');
const event = (date, start, end) => `BEGIN:VEVENT\nDTSTART;TZID=Europe/Warsaw:${date}T${start}00\nDTEND;TZID=Europe/Warsaw:${date}T${end}00\nSUMMARY:DB wyk HZ 727\nEND:VEVENT`;
const importEvents = (...events) => mapICSToCalendarData(parseICS(`BEGIN:VCALENDAR\nX-WR-TIMEZONE:Europe/Warsaw\n${events.join('\n')}\nEND:VCALENDAR`)).courses[0];
const onDate = (course, date) => course.sessions.flatMap((session) => {
  const resolved = resolveSessionForDate(session, new Date(`${date}T12:00:00`));
  return resolved ? [resolved.startTime] : [];
}).sort();

test('an off-weekday occurrence is a real session, not an unreachable override', () => {
  const course = importEvents(event('20260928', '1000', '1130'), event('20261002', '0800', '0930'), event('20261012', '1000', '1130'));
  assert.deepEqual(onDate(course, '2026-10-02'), ['08:00']);
  assert.deepEqual(onDate(course, '2026-10-05'), []);
  assert.deepEqual(onDate(course, '2026-10-09'), []);
  assert.deepEqual(onDate(course, '2026-10-12'), ['10:00']);
  assert.ok(course.sessions.flatMap(consolidateSession).some((session) => session.meetDay === 'Friday' && session.startTime === '08:00'));
});

test('multiple slots on one day are preserved without generating extra occurrences', () => {
  const course = importEvents(event('20261002', '0800', '0930'), event('20261002', '1000', '1130'), event('20261009', '1000', '1130'));
  assert.deepEqual(onDate(course, '2026-10-02'), ['08:00', '10:00']);
  assert.deepEqual(onDate(course, '2026-10-09'), ['10:00']);
});
