import test from 'node:test';
import assert from 'node:assert/strict';
import { clearRecent, loadRecent, saveRecent } from '../public/recent.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('recent numbers survive reload, deduplicate and keep the newest 20', () => {
  const storage = memoryStorage();
  for (let i = 0; i < 21; i++) {
    const number = `+49301234${String(i).padStart(2, '0')}`;
    saveRecent(storage, { number, formatted: `+49 30 1234 ${String(i).padStart(2, '0')}` });
  }
  assert.equal(loadRecent(storage).length, 20);
  assert.equal(loadRecent(storage).some(entry => entry.number === '+4930123400'), false);
  saveRecent(storage, { number: '+4930123401', formatted: '+49 30 1234 01' });
  assert.equal(loadRecent(storage)[0].number, '+4930123401');
  assert.equal(loadRecent(storage).length, 20);
  clearRecent(storage);
  assert.deepEqual(loadRecent(storage), []);
});

test('invalid or damaged stored values never become selectable numbers', () => {
  const storage = memoryStorage();
  storage.setItem('rueckwaertssuche:recent-numbers:v1', '{broken');
  assert.deepEqual(loadRecent(storage), []);
  saveRecent(storage, { number: '+49302426881', formatted: '+49 30 2426881' });
  storage.setItem('rueckwaertssuche:recent-numbers:v1', JSON.stringify([
    { number: 'javascript:alert(1)', formatted: 'bad' },
    { number: '+49302426881', formatted: '+49 30 2426881' },
  ]));
  assert.deepEqual(loadRecent(storage), [{ number: '+49302426881', formatted: '+49 30 2426881' }]);
});
