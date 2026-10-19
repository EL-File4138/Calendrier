const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const storage = new Map();
const localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
function load(name) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, `../src/utils/${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const source = { exports: {} };
  new Function('module', 'exports', 'require', 'localStorage', code)(source, source.exports, name => load(name.replace('./', '')), localStorage);
  return source.exports;
}
const { readCalendarHistory, rememberCalendar, removeCalendarHistory } = load('calendarHistory');
const app = 'https://app.example/calendrier/';
const key = 'calendrier-calendar-history-v1';
const url = number => `${app}?calendar=12345678-1234-1234-1234-${String(number).padStart(12, '0')}`;

test('recent calendars are bounded, deduplicated, ordered and individually removable', () => {
  storage.clear();
  for (let i = 0; i < 12; i++) rememberCalendar(url(i), app, `Calendar ${i}`);
  assert.equal(readCalendarHistory(app).length, 10);
  rememberCalendar(url(5), app, 'Updated');
  assert.equal(readCalendarHistory(app)[0].title, 'Updated');
  assert.equal(readCalendarHistory(app).filter(entry => entry.title === 'Calendar 5').length, 0);
  removeCalendarHistory(readCalendarHistory(app)[0].target, app);
  assert.equal(readCalendarHistory(app).length, 9);
  removeCalendarHistory();
  assert.deepEqual(readCalendarHistory(app), []);
});

test('history accepts only validated deployment links and never stores account credentials', () => {
  storage.clear();
  rememberCalendar(`${url(1)}&sessionToken=SECRET&import=bad`, app, 'Private');
  assert.ok(!storage.get(key).includes('SECRET'));
  rememberCalendar('https://evil.example/calendrier/?calendar=12345678-1234-1234-1234-123456789abc', app);
  rememberCalendar(`${app}#public=${'A'.repeat(43)}.${'B'.repeat(43)}`, app, 'Public');
  assert.equal(readCalendarHistory(app).length, 2);
  assert.ok(!readCalendarHistory(app).some(entry => entry.target.includes('evil')));
  assert.deepEqual(readCalendarHistory('https://app.example/other/'), []);
  storage.set(key, JSON.stringify([{ target: 'javascript:alert(1)', title: 'Bad', visitedAt: 1 }]));
  assert.deepEqual(readCalendarHistory(app), []);
  storage.set(key, '{');
  assert.deepEqual(readCalendarHistory(app), []);
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Storage blocked'); };
  assert.doesNotThrow(() => rememberCalendar(url(2), app));
  assert.doesNotThrow(() => removeCalendarHistory());
  localStorage.setItem = original;
});
