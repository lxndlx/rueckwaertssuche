import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createApp } from '../src/app.mjs';

async function withApp(t, providers, options = {}) {
  const server = createApp({ providers, ...options }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    post: (body, options = {}) => fetch(`${base}/api/lookup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify(body),
    }),
  };
}

test('lookup returns normalized phone plus independent provider status with no-store', async t => {
  const calls = [];
  const api = await withApp(t, { lookup: async (source, phone) => {
    calls.push({ source, phone });
    return source === 'osm'
      ? { source, status: 'found', results: [{ name: 'Beispiel', url: 'https://www.openstreetmap.org/node/1' }] }
      : { source, status: 'unavailable', results: [], error: { code: 'rate_limited', message: 'Bitte später erneut versuchen.' } };
  } });
  const responses = await Promise.all(['osm', 'phoneblock'].map(source => api.post({ phone: '030 2426881', country: 'DE', source })));
  const [osm, spam] = await Promise.all(responses.map(response => response.json()));
  assert.equal(osm.phone.number, '+49302426881');
  assert.equal(osm.results[0].name, 'Beispiel');
  assert.equal(spam.status, 'unavailable');
  assert.equal(calls.length, 2);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('invalid requests never contact a provider', async t => {
  let calls = 0;
  const api = await withApp(t, { lookup: async () => { calls++; } });
  for (const body of [null, {}, { phone: '123', source: 'osm' }, { phone: '+49302426881', source: 'https://example.org' }, { phone: '+49302426881', source: 'osm', country: 'ZZ' }]) {
    const response = await api.post(body);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(calls, 0);
});

test('malformed and oversized JSON are rejected with a German error', async t => {
  const api = await withApp(t, { lookup: async () => assert.fail('No upstream call expected') });
  for (const body of ['{broken', JSON.stringify({ phone: '1'.repeat(3000) })]) {
    const response = await fetch(`${api.base}/api/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Die Suchanfrage ist ungültig.');
  }
});

test('cross-site origins and non-local Host headers cannot use local lookup', async t => {
  const api = await withApp(t, { lookup: async () => assert.fail('No upstream call expected') });
  const body = { phone: '+49302426881', source: 'osm' };
  assert.equal((await api.post(body, { headers: { Origin: 'https://example.org' } })).status, 403);
  // Native fetch can replace Host; use HTTP directly to test the actual wire header.
  const status = await new Promise((resolve, reject) => {
    const request = httpRequest(`${api.base}/api/lookup`, {
      method: 'POST', headers: { Host: 'untrusted.example', 'Content-Type': 'application/json' },
    }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
  assert.equal(status, 403);
});

test('a matching HTTPS origin works behind a local TLS reverse proxy', async t => {
  const api = await withApp(t, { lookup: async source => ({ source, status: 'not_found', results: [] }) });
  const host = new URL(api.base).host;
  const response = await api.post({ phone: '+49302426881', source: 'osm' }, {
    headers: { Origin: `https://${host}` },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'not_found');
});

test('container mode accepts a request addressed to the homeserver', async t => {
  const api = await withApp(t, { lookup: async source => ({ source, status: 'not_found', results: [] }) }, { localOnly: false });
  const status = await new Promise((resolve, reject) => {
    const request = httpRequest(`${api.base}/api/lookup`, {
      method: 'POST', headers: {
        Host: 'homeserver.local:3000',
        Origin: 'http://homeserver.local:3000',
        'Content-Type': 'application/json',
      },
    }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end(JSON.stringify({ phone: '+49302426881', source: 'osm' }));
  });
  assert.equal(status, 200);
});

test('static page and country list work without any external requests', async t => {
  const api = await withApp(t, { lookup: async () => assert.fail('No upstream call expected') });
  const page = await fetch(api.base);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /<html lang="de">/);
  assert.match(html, /autocomplete="off"/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const countries = await (await fetch(`${api.base}/api/countries`)).json();
  assert.ok(countries.some(country => country.code === 'DE'));
  assert.ok(countries.some(country => country.code === 'JP'));
  assert.equal((await fetch(`${api.base}/.env`)).status, 404);
});
