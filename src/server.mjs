import { createApp } from './app.mjs';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT muss eine Zahl zwischen 1 und 65535 sein.');
  process.exit(1);
}
const localOnly = ['127.0.0.1', 'localhost', '::1'].includes(host);
const server = createApp({ localOnly }).listen(port, host, () => {
  console.log(`Rückwärtssuche läuft unter http://${host.includes(':') ? `[${host}]` : host}:${port}`);
  console.log('Beenden mit Strg+C. Suchanfragen werden nicht protokolliert.');
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} wird bereits verwendet. Bitte wähle einen anderen PORT in .env.`
    : 'Der lokale Server konnte nicht gestartet werden. Bitte prüfe HOST und PORT.');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}
