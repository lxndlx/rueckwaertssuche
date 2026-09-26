const key = 'rueckwaertssuche:recent-numbers:v1';
const limit = 20;

function validEntry(entry) {
  return entry && /^\+[1-9]\d{5,14}$/.test(entry.number)
    && typeof entry.formatted === 'string' && entry.formatted.length <= 40;
}

export function loadRecent(storage) {
  let saved;
  try { saved = JSON.parse(storage.getItem(key) || '[]'); }
  catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
  if (!Array.isArray(saved)) return [];
  const seen = new Set();
  return saved.filter(entry => {
    if (!validEntry(entry) || seen.has(entry.number)) return false;
    seen.add(entry.number);
    return true;
  }).slice(0, limit);
}

export function saveRecent(storage, phone) {
  if (!validEntry(phone)) return loadRecent(storage);
  const next = [
    { number: phone.number, formatted: phone.formatted },
    ...loadRecent(storage).filter(entry => entry.number !== phone.number),
  ].slice(0, limit);
  storage.setItem(key, JSON.stringify(next));
  return next;
}

export function clearRecent(storage) {
  storage.removeItem(key);
}
