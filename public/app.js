const form = document.querySelector('#search-form');
const phoneInput = document.querySelector('#phone');
const countrySelect = document.querySelector('#country');
const errorBox = document.querySelector('#form-error');
const summary = document.querySelector('#query-summary');
const sources = ['osm', 'phoneblock'];
const initialContent = new Map(sources.map(source => [source, document.querySelector(`#${source}-result`).cloneNode(true)]));
let currentSearch = 0;
let controller;
let pendingKey = null;

function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function link(text, href) {
  const element = textElement('a', text, 'result-link');
  const url = new URL(href);
  if (url.protocol !== 'https:' || !['www.openstreetmap.org', 'phoneblock.net'].includes(url.hostname)) return textElement('span', text);
  element.href = url.href;
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
  return element;
}

function setStatus(source, state, text) {
  const status = document.querySelector(`#${source}-status`);
  status.textContent = text;
  status.dataset.state = state;
  document.querySelector(`#${source}-card`).setAttribute('aria-busy', String(state === 'loading'));
}

function reset() {
  currentSearch++;
  controller?.abort();
  pendingKey = null;
  form.reset();
  countrySelect.value = 'DE';
  countrySelect.disabled = false;
  phoneInput.removeAttribute('aria-invalid');
  errorBox.hidden = true;
  errorBox.textContent = '';
  summary.textContent = '';
  for (const source of sources) {
    setStatus(source, 'idle', '');
    document.querySelector(`#${source}-result`).replaceChildren(...initialContent.get(source).cloneNode(true).childNodes);
  }
}

function updateCountryMode() {
  countrySelect.disabled = /^(?:\+|00)/.test(phoneInput.value.trim());
}

function showInputError(message) {
  phoneInput.setAttribute('aria-invalid', 'true');
  errorBox.textContent = message;
  errorBox.hidden = false;
  phoneInput.focus();
}

function render(source, payload) {
  const content = document.querySelector(`#${source}-result`);
  content.replaceChildren();
  if (payload.status === 'unavailable') {
    setStatus(source, 'unavailable', 'Quelle gerade nicht verfügbar');
    content.append(textElement('p', payload.error.message, 'detail'));
    return;
  }
  if (payload.status === 'not_found') {
    setStatus(source, 'not_found', source === 'osm' ? 'Kein Firmeneintrag gefunden' : 'Keine Hinweise gefunden');
    content.append(textElement('p', source === 'osm'
      ? 'In OpenStreetMap ist kein passender Eintrag mit dieser internationalen Telefonnummer vorhanden.'
      : 'PhoneBlock kennt derzeit keine Hinweise zu dieser Nummer. Das bedeutet nicht, dass der Anruf sicher ist.', 'detail'));
    return;
  }
  if (source === 'osm') {
    const count = payload.results.length;
    setStatus(source, 'found', `${count} ${count === 1 ? 'Eintrag gefunden' : 'Einträge gefunden'}`);
    const list = document.createElement('ul');
    list.className = 'business-list';
    for (const result of payload.results) {
      const item = document.createElement('li');
      item.append(textElement('p', result.name, 'business-name'));
      if (result.location) item.append(textElement('p', result.location, 'detail'));
      item.append(link('Eintrag bei OpenStreetMap ansehen', result.url));
      list.append(item);
    }
    content.append(list);
    if (payload.truncated) content.append(textElement('p', 'Es wird nur eine Auswahl der passenden Einträge angezeigt.', 'detail'));
  } else {
    const result = payload.results[0];
    setStatus(source, 'found', 'Bewertung vorhanden');
    const badge = textElement('p', result.label, 'rating');
    badge.dataset.tone = result.tone;
    content.append(badge);
    if (result.rangeOnly) {
      content.append(textElement('p', 'Die Hinweise betreffen benachbarte Nummern. Zur eingegebenen Nummer selbst liegt keine Bewertung vor.', 'detail'));
    } else if (result.confidence !== null && result.confidence > 0) {
      content.append(textElement('p', `Spam-Einschätzung von PhoneBlock: ${result.confidence} von 100.`, 'detail'));
    }
    if (result.updatedAt) content.append(textElement('p', `Letzte Meldung: ${new Intl.DateTimeFormat('de-DE').format(new Date(result.updatedAt))}`, 'detail'));
    content.append(textElement('p', 'Die Angaben beruhen auf Community-Meldungen. Sie bestätigen weder die Identität noch die Sicherheit des Anrufers.', 'detail'));
  }
}

async function lookup(source, request, searchId, signal) {
  try {
    const response = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, source }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(22_000)]),
      cache: 'no-store',
    });
    const payload = await response.json();
    if (searchId !== currentSearch || signal.aborted) return;
    if (response.status === 400) {
      controller.abort();
      for (const provider of sources) {
        setStatus(provider, 'idle', '');
        document.querySelector(`#${provider}-result`).replaceChildren(...initialContent.get(provider).cloneNode(true).childNodes);
      }
      summary.textContent = '';
      showInputError(payload.error);
      return;
    }
    if (!response.ok) throw new Error('Request failed');
    summary.textContent = `${payload.phone.formatted} · ${payload.phone.countryName}`;
    if (payload.phone.country && countrySelect.querySelector(`option[value="${payload.phone.country}"]`)) {
      countrySelect.value = payload.phone.country;
    }
    render(source, payload);
  } catch {
    if (searchId !== currentSearch || signal.aborted) return;
    render(source, {
      status: 'unavailable',
      error: { message: 'Die Abfrage konnte nicht abgeschlossen werden. Bitte prüfe, ob der lokale Server läuft, und versuche es erneut.' },
    });
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const request = { phone: phoneInput.value.trim(), country: countrySelect.value };
  const key = JSON.stringify(request);
  if (pendingKey === key) return;
  const searchId = ++currentSearch;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  pendingKey = key;
  errorBox.hidden = true;
  errorBox.textContent = '';
  phoneInput.removeAttribute('aria-invalid');
  if (!request.phone) {
    pendingKey = null;
    for (const source of sources) {
      setStatus(source, 'idle', '');
      document.querySelector(`#${source}-result`).replaceChildren(...initialContent.get(source).cloneNode(true).childNodes);
    }
    summary.textContent = '';
    showInputError('Bitte gib eine vollständige Telefonnummer mit Vorwahl ein.');
    return;
  }
  summary.textContent = 'Die Quellen werden unabhängig abgefragt …';
  for (const source of sources) {
    setStatus(source, 'loading', 'Wird abgefragt …');
    document.querySelector(`#${source}-result`).replaceChildren(textElement('p', 'Die Suche kann bis zu 20 Sekunden dauern.', 'detail'));
  }
  await Promise.allSettled(sources.map(source => lookup(source, request, searchId, signal)));
  if (searchId === currentSearch) pendingKey = null;
});

phoneInput.addEventListener('input', () => {
  updateCountryMode();
  phoneInput.removeAttribute('aria-invalid');
  errorBox.hidden = true;
});
window.addEventListener('pageshow', event => { if (event.persisted) reset(); });
reset();
try {
  const response = await fetch('/api/countries', { cache: 'no-store' });
  if (!response.ok) throw new Error('Countries unavailable');
  const countries = await response.json();
  const selected = countrySelect.value;
  countrySelect.replaceChildren(...countries.map(country => {
    const option = textElement('option', country.name);
    option.value = country.code;
    return option;
  }));
  countrySelect.value = selected;
} catch {
  const notice = document.querySelector('#country-error');
  notice.textContent = 'Die Länderliste konnte nicht geladen werden. Verwende für ausländische Nummern bitte die Vorwahl mit + oder 00.';
  notice.hidden = false;
}
