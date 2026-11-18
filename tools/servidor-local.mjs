// Prueba Que Tapa! en el ordenador, sin Docker: sirve la web y la API como en el servidor.
//   node tools/servidor-local.mjs   ->  http://localhost:8080/
// Los datos (bares, tapas, fotos) se guardan en ./.datos-locales. Variables: PUERTO, OSM=1 para
// descargar los bares de OpenStreetMap (apagado por defecto en local).
// Para ver la web llena sin datos: http://localhost:8080/?ejemplo
import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/api.mjs';

const ROOT = fileURLToPath(new URL('../app/', import.meta.url));
const DATA = fileURLToPath(new URL('../.datos-locales/', import.meta.url));
const PORT = Number(process.env.PUERTO) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

mkdirSync(DATA, { recursive: true });
const api = createApp({ dataDir: DATA, base: `http://localhost:${PORT}`, osm: { enabled: process.env.OSM === '1' } });
api.osm.tick();
setInterval(() => api.flush(), 10000);
console.log(`Moderación: ${api.adminLink()}`);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/compartir/')) { api.handle(req, res); return; }
  let file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(ROOT, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Que Tapa! en http://localhost:${PORT}/`));
