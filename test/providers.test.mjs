import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { normalizePhone } from '../src/phone.mjs';
import { buildOverpassQuery, createProviders, parseBusinesses, parseSpam } from '../src/providers.mjs';

const phone = normalizePhone('+49302426881');
const entry = (id, tags = {}) => ({ type: 'node', id, tags: { name: 'Beispielfirma', phone: phone.number, ...tags } });
const unknown = {
  phone: phone.number, votes: 0, votesWildcard: 0, rating: 'A_LEGITIMATE',
  whiteListed: false, dateAdded: 0, lastUpdate: 0, spamConfidence: 0,
};

test('OSM verifies exact numbers, preserves multiple names and removes repeated elements', () => {
  const first = entry(1, { phone: '+49 30 2426881', 'addr:city': 'Berlin', 'addr:postcode': '10178' });
  const result = parseBusinesses({ elements: [first, first,
    entry(2, { phone: null, 'contact:phone': '+12025550123; +49 (30) 242-6881' }),
    entry(3, { phone: '+493024268810' }), entry(4, { name: '' }),
  ] }, phone);
  assert.equal(result.status, 'found');
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].location, '10178 Berlin');
  assert.equal(result.results[1].url, 'https://www.openstreetmap.org/node/2');
});

test('OSM reports an empty result, caps results and retains names as plain data', () => {
  assert.equal(parseBusinesses({ elements: [] }, phone).status, 'not_found');
  const result = parseBusinesses({ elements: Array.from({ length: 25 }, (_, i) => entry(i + 1, { name: '<img src=x onerror=alert(1)>' })) }, phone);
  assert.equal(result.results.length, 20);
  assert.equal(result.truncated, true);
  assert.equal(result.results[0].name, '<img src=x onerror=alert(1)>');
});

test('OSM query bounds and shape reject partial or malformed responses', () => {
  const query = buildOverpassQuery(phone.number);
  assert.ok(query.includes('[timeout:15]'));
  assert.ok(query.includes('contact:phone'));
  assert.throws(() => buildOverpassQuery('123"];out;'));
  for (const body of [null, {}, { elements: {} }, { elements: [], remark: 'runtime error: timeout' }, { elements: [null] }, { elements: [{ type: 'node', id: 2 }] }]) {
    assert.throws(() => parseBusinesses(body, phone));
  }
});

test('unknown PhoneBlock A_LEGITIMATE response never means safe', () => {
  assert.deepEqual(parseSpam(unknown, phone), { status: 'not_found', results: [] });
});

test('PhoneBlock ratings preserve source confidence without presenting weighted votes as counts', () => {
  const result = parseSpam({ ...unknown, rating: 'G_FRAUD', votes: 15, spamConfidence: 85, dateAdded: 1700000000000, lastUpdate: 1710000000000 }, phone);
  assert.equal(result.status, 'found');
  assert.equal(result.results[0].label, 'Betrugsverdacht');
  assert.equal(result.results[0].confidence, 85);
  assert.equal(result.results[0].tone, 'caution');
  assert.equal('votes' in result.results[0], false);
});

test('range-only warnings are distinct from reports about the exact number', () => {
  const result = parseSpam({ ...unknown, votesWildcard: 8 }, phone);
  assert.equal(result.results[0].rangeOnly, true);
  assert.equal(result.results[0].confidence, null);
  assert.equal(result.results[0].label, 'Hinweise zu ähnlichen Nummern');
});

test('existing legitimate ratings remain neutral and are attributed', () => {
  const result = parseSpam({ ...unknown, whiteListed: true }, phone);
  assert.equal(result.status, 'found');
  assert.equal(result.results[0].tone, 'neutral');
  assert.equal(result.results[0].label, 'Als seriös bewertet');
});

test('PhoneBlock rejects missing fields, unknown ratings, mismatches and invalid confidence', () => {
  for (const body of [null, {}, { ...unknown, phone: '+12025550123' }, { ...unknown, rating: 'constructor' }, { ...unknown, votes: 'many' }, { ...unknown, spamConfidence: 101 }]) {
    assert.throws(() => parseSpam(body, phone));
  }
});

test('provider sends only fixed HTTPS requests with no credentials or retries', async () => {
  const calls = [];
  const providers = createProviders({ fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ elements: [] });
  } });
  const result = await providers.lookup('osm', phone);
  assert.equal(result.status, 'not_found');
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).hostname, 'overpass-api.de');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('HTTP errors, bad JSON, failed fetches and oversized bodies are unavailable, not no-result', async () => {
  const cases = [
    [() => new Response('limit', { status: 429 }), 'rate_limited'],
    [() => new Response('down', { status: 503 }), 'unavailable'],
    [() => new Response('<html>login</html>'), 'invalid_response'],
    [() => Response.json({ elements: [], remark: 'timeout' }), 'invalid_response'],
    [() => new Response('{}', { headers: { 'content-length': '2000001' } }), 'invalid_response'],
    [() => { throw new Error('Offline'); }, 'unavailable'],
  ];
  for (const [fetchImpl, code] of cases) {
    const result = await createProviders({ fetchImpl }).lookup('osm', phone);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.error.code, code);
  }
});

test('a slow source times out independently of a fast successful source', async () => {
  const providers = createProviders({ timeoutMs: 15, fetchImpl: async (url, { signal }) => {
    if (String(url).includes('overpass')) {
      await delay(200, undefined, { signal });
      return Response.json({ elements: [] });
    }
    return Response.json(unknown);
  } });
  const [osm, spam] = await Promise.all([providers.lookup('osm', phone), providers.lookup('phoneblock', phone)]);
  assert.equal(osm.error.code, 'timeout');
  assert.equal(spam.status, 'not_found');
});

test('disconnect or superseded lookup aborts upstream work', async () => {
  const controller = new AbortController();
  const providers = createProviders({ fetchImpl: async (_url, { signal }) => {
    await delay(200, undefined, { signal });
    return Response.json(unknown);
  } });
  const lookup = providers.lookup('phoneblock', phone, { signal: controller.signal });
  controller.abort();
  await assert.rejects(lookup);
});
