import express from 'express';
import { fileURLToPath } from 'node:url';
import { countries, InputError, normalizePhone } from './phone.mjs';
import { createProviders } from './providers.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

export function createApp({ providers = createProviders(), localOnly = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    if (localOnly && !['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) {
      return res.status(403).json({ error: 'Die Seite ist nur lokal erreichbar.' });
    }
    if (req.path.startsWith('/api/') && req.get('origin') && req.get('origin') !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ error: 'Diese Abfrage ist nur von der lokalen Seite aus möglich.' });
    }
    next();
  });
  app.use(express.json({ limit: '2kb' }));
  app.get('/api/countries', (_req, res) => res.json(countries));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/lookup', async (req, res) => {
    const { phone: input, country = 'DE', source } = req.body ?? {};
    if (!['osm', 'phoneblock'].includes(source)) {
      return res.status(400).json({ error: 'Bitte wähle eine unterstützte Suchquelle.' });
    }
    let phone;
    try { phone = normalizePhone(input, country); }
    catch (error) {
      if (error instanceof InputError) return res.status(400).json({ error: error.message });
      throw error;
    }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const result = await providers.lookup(source, phone, { signal: controller.signal });
      if (!controller.signal.aborted) res.json({ phone, ...result });
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  });
  app.use(express.static(publicDir, { etag: false, lastModified: false, dotfiles: 'deny' }));
  app.use((_req, res) => res.status(404).json({ error: 'Diese Seite wurde nicht gefunden.' }));
  app.use((error, _req, res, _next) => {
    const badBody = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
    res.status(badBody ? 400 : 500).json({ error: badBody ? 'Die Suchanfrage ist ungültig.' : 'Die Anfrage konnte nicht verarbeitet werden.' });
  });
  return app;
}
