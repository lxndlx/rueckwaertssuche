// Optional, manually run smoke check. npm test never contacts these services.
import { createProviders, PHONEBLOCK_TEST_URL } from '../src/providers.mjs';
import { normalizePhone } from '../src/phone.mjs';

const providers = createProviders({
  phoneBlockBaseUrl: PHONEBLOCK_TEST_URL,
  fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    console.log(`${new URL(url).hostname}: HTTP ${response.status}`);
    return response;
  },
});
const checks = [
  ['osm', '+49302426881'], // Public Nordsee business listing, OSM node 437611378.
  ['phoneblock', '+12025550123'], // Reserved example number; test installation only.
];
for (const [source, number] of checks) {
  const result = await providers.lookup(source, normalizePhone(number));
  console.log(`${source}: ${result.status}`, result.status === 'unavailable' ? result.error.code : `${result.results.length} result(s)`);
  if (result.status === 'unavailable' || (source === 'osm' && !result.results.some(item => item.id === 'node/437611378'))) {
    process.exitCode = 1;
  }
}
