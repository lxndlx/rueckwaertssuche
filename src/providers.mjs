import { matchesPhone } from './phone.mjs';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const PHONEBLOCK_URL = 'https://phoneblock.net/phoneblock/api';
export const PHONEBLOCK_TEST_URL = 'https://phoneblock.net/pb-test/api';
const ratings = {
  A_LEGITIMATE: 'Als seriös bewertet',
  B_MISSED: 'Unbekannter Anruf',
  C_PING: 'Verdacht auf Ping-Anruf',
  D_POLL: 'Umfrage',
  E_ADVERTISING: 'Werbung',
  F_GAMBLE: 'Gewinnspiel',
  G_FRAUD: 'Betrugsverdacht',
};

class ProviderError extends Error {
  constructor(code, upstreamStatus) { super(code); this.code = code; this.upstreamStatus = upstreamStatus; }
}

const messages = {
  timeout: 'Die Quelle hat nicht rechtzeitig geantwortet. Bitte versuche es später erneut.',
  rate_limited: 'Die Quelle begrenzt gerade die Abfragen. Bitte versuche es später erneut.',
  unavailable: 'Die Quelle ist gerade nicht erreichbar. Bitte versuche es später erneut.',
  invalid_response: 'Die Quelle hat keine auswertbare Antwort geliefert. Bitte versuche es später erneut.',
};

export function buildOverpassQuery(number) {
  if (!/^\+[1-9]\d{5,14}$/.test(number)) throw new Error('Expected an E.164 number');
  // Match the entire number (including list boundaries), never a substring.
  const digits = [...number.slice(1)].join('[[:space:].()/-]*');
  const pattern = `(^|;)[[:space:]]*([+]|00)${digits}[[:space:]]*(;|$)`;
  return `[out:json][timeout:15];(nwr["phone"~"${pattern}"];nwr["contact:phone"~"${pattern}"];);out tags 101;`;
}

export function parseBusinesses(body, phone) {
  if (!body || !Array.isArray(body.elements) || body.remark) {
    throw new ProviderError('invalid_response');
  }
  const results = [];
  const seen = new Set();
  for (const item of body.elements) {
    if (!item || !['node', 'way', 'relation'].includes(item.type) || !Number.isSafeInteger(item.id) || item.id <= 0) {
      throw new ProviderError('invalid_response');
    }
    const tags = item.tags;
    if (!tags || typeof tags !== 'object' || Array.isArray(tags)) throw new ProviderError('invalid_response');
    if (!matchesPhone(tags.phone, phone.number, tags['addr:country']) &&
        !matchesPhone(tags['contact:phone'], phone.number, tags['addr:country'])) continue;
    const name = typeof tags.name === 'string' ? tags.name.trim() : '';
    if (!name) continue;
    const location = [tags['addr:postcode'], tags['addr:city'] || tags['addr:town'] || tags['addr:village']]
      .filter(value => typeof value === 'string' && value.trim()).join(' ');
    const id = `${item.type}/${item.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({ id, name, location, url: `https://www.openstreetmap.org/${id}` });
  }
  return {
    status: results.length ? 'found' : 'not_found',
    results: results.slice(0, 20),
    truncated: results.length > 20 || body.elements.length > 100,
  };
}

export function parseSpam(body, phone) {
  if (!body || body.phone !== phone.number || !Object.hasOwn(ratings, body.rating) ||
      !Number.isFinite(body.votes) || !Number.isFinite(body.votesWildcard) ||
      !Number.isFinite(body.dateAdded) || body.dateAdded < 0 ||
      !Number.isFinite(body.lastUpdate) || body.lastUpdate < 0 ||
      typeof body.whiteListed !== 'boolean') {
    throw new ProviderError('invalid_response');
  }
  const confidence = body.spamConfidence;
  if (confidence !== undefined && (!Number.isInteger(confidence) || confidence < 0 || confidence > 100)) {
    throw new ProviderError('invalid_response');
  }
  // PhoneBlock returns A_LEGITIMATE even for completely unknown numbers.
  const known = body.whiteListed || body.dateAdded > 0 || body.lastUpdate > 0 || body.votes > 0 || confidence > 0;
  const rangeOnly = !known && body.votesWildcard > 0;
  if (!known && !rangeOnly) return { status: 'not_found', results: [] };
  const caution = body.votes > 0 || confidence > 0 || !['A_LEGITIMATE', 'B_MISSED'].includes(body.rating);
  return {
    status: 'found',
    results: [{
      label: rangeOnly ? 'Hinweise zu ähnlichen Nummern' : ratings[body.rating],
      tone: rangeOnly || caution ? 'caution' : 'neutral',
      rangeOnly,
      // votes is a decaying signal, not a count of individual reports.
      confidence: rangeOnly || confidence === undefined ? null : confidence,
      updatedAt: body.lastUpdate > 0 ? body.lastUpdate : null,
      url: 'https://phoneblock.net/phoneblock/',
    }],
  };
}

export function createProviders({ fetchImpl = globalThis.fetch, timeoutMs = 20_000, phoneBlockBaseUrl = PHONEBLOCK_URL } = {}) {
  async function request(url, signal) {
    const response = await fetchImpl(url, {
      signal,
      redirect: 'error',
      headers: { Accept: 'application/json', 'User-Agent': 'Rueckwaertssuche/1.0 (private local lookup)' },
    });
    if (response.status === 429) throw new ProviderError('rate_limited', response.status);
    if (!response.ok) throw new ProviderError('unavailable', response.status);
    if (Number(response.headers.get('content-length')) > 2_000_000) throw new ProviderError('invalid_response');
    let data;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 2_000_000) throw new ProviderError('invalid_response');
        chunks.push(chunk);
      }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      throw error instanceof ProviderError ? error : new ProviderError('invalid_response');
    }
    return data;
  }

  async function lookup(source, phone, { signal } = {}) {
    const deadline = AbortSignal.timeout(Math.min(timeoutMs, 20_000));
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      let result;
      if (source === 'osm') {
        const url = new URL(OVERPASS_URL);
        url.searchParams.set('data', buildOverpassQuery(phone.number));
        result = parseBusinesses(await request(url, combined), phone);
      } else if (source === 'phoneblock') {
        const url = `${phoneBlockBaseUrl}/num/${encodeURIComponent(phone.number)}?format=json`;
        result = parseSpam(await request(url, combined), phone);
      } else {
        throw new Error('Unknown provider');
      }
      return { source, ...result };
    } catch (error) {
      if (signal?.aborted) throw error;
      const code = deadline.aborted ? 'timeout' : error instanceof ProviderError ? error.code : 'unavailable';
      return {
        source, status: 'unavailable', results: [],
        error: { code, message: messages[code], ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}) },
      };
    }
  }
  return { lookup };
}
