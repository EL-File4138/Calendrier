const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function worker() {
  const handlers = {};
  const shell = new Response('<main>cached shell</main>');
  const scope = 'https://example.test/calendrier/';
  vm.runInNewContext(fs.readFileSync('public/service-worker.js', 'utf8'), {
    URL,
    self: { registration: { scope }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { open: async () => ({ match: async key => key === `${scope}index.html` ? shell : undefined }) },
    fetch: async () => { throw new TypeError('Offline'); },
  });
  return handlers.fetch;
}

test('offline query navigation falls back to the cached application shell', async () => {
  let response;
  worker()({
    request: { method: 'GET', url: 'https://example.test/calendrier/?calendar=id', destination: 'document', mode: 'navigate' },
    respondWith: promise => { response = promise; },
    waitUntil: () => {},
  });
  assert.equal(await (await response).text(), '<main>cached shell</main>');
});

test('service worker never caches API requests, writes or other origins', () => {
  for (const request of [
    { method: 'GET', url: 'https://example.test/calendrier/api/calendar/read', destination: '' },
    { method: 'POST', url: 'https://example.test/calendrier/', destination: 'document' },
    { method: 'GET', url: 'https://other.test/calendrier/', destination: 'document' },
  ]) {
    worker()({ request, respondWith: () => assert.fail('Request must bypass cache') });
  }
});
