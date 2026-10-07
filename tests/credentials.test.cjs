const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/utils/credentials.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const source = { exports: {} };
new Function('module', 'exports', code)(source, source.exports);
const { parseCredentials } = source.exports;
const serverUrl = 'https://worker.example';
const backup = { format: 'calendrier-credentials', version: 1, serverUrl, userId: '12345678-1234-1234-1234-123456789abc', sessionToken: 'A'.repeat(43) };

test('QR JSON and file JSON use the same validated credential format', () => {
  assert.deepEqual(parseCredentials(JSON.stringify(backup), serverUrl), backup);
});

test('credential scan rejects malformed, wrong-server, wrong-version and oversized payloads', () => {
  for (const value of ['https://example.com', 'null', '[]', JSON.stringify({ ...backup, serverUrl: 'https://other.example' }), JSON.stringify({ ...backup, version: 2 }), JSON.stringify({ ...backup, sessionToken: 'short' }), JSON.stringify({ ...backup, userId: 'invalid' }), JSON.stringify({ ...backup, extra: 'x'.repeat(4096) })]) {
    assert.throws(() => parseCredentials(value, serverUrl));
  }
});
