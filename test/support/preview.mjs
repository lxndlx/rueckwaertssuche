// Browser QA only. Isolated local server, fixed examples, no outbound requests.
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../../src/app.mjs';

const providers = {
  async lookup(source, phone, { signal }) {
    await delay(source === 'osm' ? 1600 : 150, undefined, { signal });
    if (phone.country === 'GB') return { source, status: 'not_found', results: [] };
    if (source === 'phoneblock') return {
      source, status: 'found', results: [{ label: 'Betrugsverdacht', tone: 'caution', rangeOnly: false, confidence: 82, updatedAt: 1710000000000 }],
    };
    if (phone.country === 'US') return {
      source, status: 'unavailable', results: [], error: { code: 'rate_limited', message: 'Die Quelle begrenzt gerade die Abfragen. Bitte versuche es später erneut.' },
    };
    return {
      source, status: 'found', results: [
        { name: 'Testfirma <img src=x onerror=alert(1)>', location: '10178 Berlin', url: 'https://www.openstreetmap.org/node/437611378' },
        { name: 'Zweite Testeinrichtung', location: 'Berlin', url: 'https://www.openstreetmap.org/node/437614448' },
      ],
    };
  },
};
const server = createApp({ providers, previewMode: true }).listen(0, '127.0.0.1', () => {
  console.log(`NUR TESTDATEN: http://127.0.0.1:${server.address().port}`);
});
process.on('SIGINT', () => { server.close(); server.closeAllConnections(); });
