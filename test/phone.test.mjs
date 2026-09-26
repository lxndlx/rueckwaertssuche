import test from 'node:test';
import assert from 'node:assert/strict';
import { countries, InputError, matchesPhone, normalizePhone } from '../src/phone.mjs';

test('German formatting variants resolve to the same full number', () => {
  for (const value of ['030 2426881', '(030) 242-6881', '030/2426881', '+49 30 2426881', '0049 30 2426881', '+49 (0)30 2426881']) {
    assert.equal(normalizePhone(value).number, '+49302426881', value);
  }
});

test('explicit international prefixes override the selected country', () => {
  assert.equal(normalizePhone('+1 (202) 555-0123', 'DE').country, 'US');
  assert.equal(normalizePhone('0044 20 7946 0018', 'DE').number, '+442079460018');
  assert.equal(normalizePhone('020 7946 0018', 'GB').number, '+442079460018');
  assert.equal(normalizePhone('+39 02 3661 8300', 'DE').number, '+390236618300');
});

test('invalid, partial, ambiguous and injected inputs are rejected', () => {
  for (const input of ['', '  ', '123', '110', '+9991234567', 'Call +49302426881', '+49302426881x2', '030;123', '<script>', '++49302426881', '1'.repeat(101), null, 123, {}]) {
    assert.throws(() => normalizePhone(input), InputError, String(input));
  }
  assert.throws(() => normalizePhone('+49302426881', 'ZZ'), InputError);
});

test('OSM list values match exactly, without guessing a national country', () => {
  assert.equal(matchesPhone('+1 2025550123; +49 (30) 242-6881', '+49302426881'), true);
  assert.equal(matchesPhone('0049 30 2426881', '+49302426881'), true);
  assert.equal(matchesPhone('+493024268810', '+49302426881'), false);
  assert.equal(matchesPhone('+49302426881 ext. 2', '+49302426881'), false);
  assert.equal(matchesPhone('0302426881', '+49302426881'), false);
  assert.equal(matchesPhone('0302426881', '+49302426881', 'DE'), true);
});

test('country list has German names and international coverage', () => {
  assert.ok(countries.length > 200);
  assert.equal(countries.find(country => country.code === 'DE').name, 'Deutschland');
  assert.equal(countries.find(country => country.code === 'CH').name, 'Schweiz');
});
