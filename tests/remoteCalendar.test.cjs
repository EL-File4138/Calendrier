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
const { calendarLinkTarget, RemoteCalendarError, isRemoteUnavailable, remoteCacheIdentity, readRemoteCache, writeRemoteCache, clearRemoteCache } = load('remoteCalendar');
const app = 'https://app.example/calendrier/';
const id = '12345678-1234-1234-1234-123456789abc';
const hash = `#public=${'A'.repeat(43)}.${'B'.repeat(43)}`;

test('calendar URL entry accepts only this deployment and recognized calendar targets', () => {
  assert.equal(calendarLinkTarget(` ${app}?calendar=${id} `, app), `/calendrier/?calendar=${id}`);
  assert.equal(calendarLinkTarget(`${app}${hash}`, app), `/calendrier/${hash}`);
  assert.equal(calendarLinkTarget(`${app}index.html${hash}`, app), `/calendrier/${hash}`);
  for (const value of ['javascript:alert(1)', 'file:///etc/passwd', app, `${app}?import=anything`, `${app}?calendar=invalid`, `${app}#public=bad`, `https://evil.example/calendrier/${hash}`, `https://user:password@app.example/calendrier/${hash}`, `https://app.example/other/${hash}`]) {
    assert.equal(calendarLinkTarget(value, app), null, value);
  }
});

test('only transport errors and server outages permit cached access, not auth failures', () => {
  assert.equal(isRemoteUnavailable(new TypeError('fetch failed')), true);
  assert.equal(isRemoteUnavailable(new RemoteCalendarError(503, 'unavailable')), true);
  for (const status of [400, 401, 403, 404, 410, 429]) assert.equal(isRemoteUnavailable(new RemoteCalendarError(status, 'rejected')), false);
  assert.equal(isRemoteUnavailable(new Error('Invalid response')), false);
});

test('calendar writes preserve HTTP status for offline and authorization handling', async () => {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/api/client.ts'), 'utf8')
    .replace('import.meta.env.VITE_WORKER_URL', JSON.stringify('https://worker.test')), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const status of [401, 403, 503]) {
    const source = { exports: {} };
    new Function('module', 'exports', 'require', 'fetch', code)(source, source.exports,
      () => ({ RemoteCalendarError }), async () => new Response(JSON.stringify({ error: 'Rejected' }), { status }));
    await assert.rejects(source.exports.calendarAPI.writeCalendar(id, 'user', 'token', { courses: [] }, 1), error => {
      assert.ok(error instanceof RemoteCalendarError);
      assert.equal(error.status, status);
      assert.equal(isRemoteUnavailable(error), status === 503);
      return true;
    });
  }
});

test('remote snapshots are read-only, credential/server scoped and separate from local calendars', async () => {
  storage.clear();
  localStorage.setItem('academic-calendar-data', 'local original');
  const identity = await remoteCacheIdentity(['server', id, 'user', 'secret-token']);
  const otherToken = await remoteCacheIdentity(['server', id, 'user', 'other-token']);
  const otherServer = await remoteCacheIdentity(['other-server', id, 'user', 'secret-token']);
  const snapshot = { data: { title: 'Remote', courses: [] }, version: 5, updatedAt: 100, hasWriteAccess: true };
  writeRemoteCache('private', identity, snapshot);
  assert.deepEqual(readRemoteCache('private', identity), { ...snapshot, hasWriteAccess: false });
  assert.equal(readRemoteCache('private', otherToken), null);
  assert.equal(readRemoteCache('private', otherServer), null);
  assert.equal(readRemoteCache('public', identity), null);
  assert.ok(![...storage.values()].join('').includes('secret-token'));
  writeRemoteCache('public', otherToken, snapshot);
  clearRemoteCache('private');
  assert.equal(readRemoteCache('private', identity), null);
  assert.ok(readRemoteCache('public', otherToken));
  assert.equal(localStorage.getItem('academic-calendar-data'), 'local original');
});

test('corrupt or unavailable cache storage does not prevent live viewing', () => {
  storage.set('calendrier-remote-private-v1', '{');
  assert.equal(readRemoteCache('private', 'identity'), null);
  storage.set('calendrier-remote-private-v1', JSON.stringify({ identity: 'identity', snapshot: { version: 'invalid', data: { courses: [] } } }));
  assert.equal(readRemoteCache('private', 'identity'), null);
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.doesNotThrow(() => writeRemoteCache('private', 'identity', {}));
  localStorage.setItem = original;
});
