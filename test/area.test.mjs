import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/phone.mjs';
import { lookupArea } from '../src/area.mjs';

test('geographic prefixes identify Berlin, Zürich and Wien without a network call', async () => {
  for (const [number, expected] of [
    ['+49302426881', 'Berlin'],
    ['+41446681800', 'Zürich'],
    ['+43123456789', 'Wien'],
  ]) {
    assert.deepEqual(await lookupArea(normalizePhone(number)), { name: expected });
  }
});

test('international fixed lines can have an area, while a mobile number does not', async () => {
  assert.deepEqual(await lookupArea(normalizePhone('+442079460958')), { name: 'London' });
  assert.equal(await lookupArea(normalizePhone('+4915112345678')), null);
});
