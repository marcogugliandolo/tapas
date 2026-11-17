import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from './api.mjs';
import { waNumber } from './admin.mjs';
import { jpegSize } from './fotos.mjs';
import { parseOverpass } from './osm.mjs';
import { jornada } from './util.mjs';

/** Un JPEG mínimo: lo justo para que se lean sus marcadores y su tamaño. */
function fakeJpeg(width, height, extra = 400) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(extra, 0x55), Buffer.from([0xff, 0xd9])]);
}
const photo = () => ({ foto: fakeJpeg(1280, 960, 5000).toString('base64'), mini: fakeJpeg(240, 240).toString('base64') });

const OSM = [
  { id: 'osm-n1', nombre: 'Bar Uno', lat: 43.0118, lon: -7.5568, dir: 'Rúa Nova, 1', tipo: 'bar' },
  { id: 'osm-n2', nombre: 'Taberna Dous', lat: 43.0101, lon: -7.5577, dir: '', tipo: 'bar' },
];
const fakeOsm = { list: () => OSM, get: (id) => OSM.find((b) => b.id === id) ?? null, tick: async () => false };

let dir;
let app;
let url;
let clock = Date.parse('2026-11-14T13:00:00Z');
const KEY = 'clave-de-prueba-123';

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tapas-'));
  app = createApp({ dataDir: dir, adminKey: KEY, now: () => clock, base: 'https://tapas.test', osm: { instance: fakeOsm } });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => { app.server.close(); rmSync(dir, { recursive: true, force: true }); });

const post = (path, body, ip = '10.0.0.1') => fetch(url + path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip } });
const form = (body) => fetch(`${url}/api/admin`, { method: 'POST', body: new URLSearchParams({ clave: KEY, ...body }), redirect: 'manual' });

test('lee el tamaño de un JPEG y rechaza lo que no lo es', () => {
  assert.deepEqual(jpegSize(fakeJpeg(800, 600)), { width: 800, height: 600 });
  assert.equal(jpegSize(Buffer.from('<svg>hola</svg>'.repeat(30))), null);
  assert.equal(jpegSize(Buffer.alloc(300, 0)), null);
});

test('la jornada de viños empieza a las 5 de la mañana', () => {
  assert.equal(jornada(Date.parse('2026-11-15T00:30:00Z')), '2026-11-14'); // 01:30 en Lugo
  assert.equal(jornada(Date.parse('2026-11-15T05:00:00Z')), '2026-11-15'); // 06:00 en Lugo
});

test('Overpass: se queda con los sitios con nombre y punto', () => {
  const out = parseOverpass({ elements: [
    { type: 'node', id: 5, lat: 43.01, lon: -7.55, tags: { amenity: 'bar', name: 'O Bar', 'addr:street': 'Rúa da Cruz', 'addr:housenumber': '3' } },
    { type: 'way', id: 6, center: { lat: 43.02, lon: -7.56 }, tags: { amenity: 'restaurant', name: 'Casa' } },
    { type: 'node', id: 7, lat: 43.01, lon: -7.55, tags: { amenity: 'bar' } },
    { type: 'node', id: 8, lat: 43.01, lon: -7.55, tags: { amenity: 'bank', name: 'Banco' } },
  ] });
  assert.deepEqual(out.map((b) => b.id), ['osm-w6', 'osm-n5']);
  assert.equal(out[1].dir, 'Rúa da Cruz, 3');
});

test('WhatsApp: teléfonos españoles escritos de cualquier forma', () => {
  assert.equal(waNumber('600 11 22 33'), '34600112233');
  assert.equal(waNumber('+34 711-22-33-44'), '34711223344');
  assert.equal(waNumber('bar@correo.es'), '');
});

test('portada: salen los bares de OpenStreetMap y ninguna tapa', async () => {
  const data = await (await fetch(`${url}/api/hoy`)).json();
  assert.equal(data.fecha, '2026-11-14');
  assert.equal(data.bares.length, 2);
  assert.deepEqual(data.tapas, []);
});

test('la foto de un cliente espera a la moderación y luego sale', async () => {
  const res = await post('/api/tapas', { bar: 'osm-n1', nombre: 'Raxo con patatas', tipos: ['carne', 'nada'], ...photo() });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).estado, 'pendiente');
  assert.equal((await (await fetch(`${url}/api/hoy`)).json()).tapas.length, 0);

  const page = await (await fetch(`${url}/api/admin?clave=${KEY}`)).text();
  const id = page.match(/name="accion" value="publicar"><input type="hidden" name="id" value="([^"]+)"/)[1];
  const done = await form({ accion: 'publicar', id });
  assert.equal(done.status, 200);
  const hoy = await (await fetch(`${url}/api/hoy`)).json();
  assert.equal(hoy.tapas.length, 1);
  assert.deepEqual(hoy.tapas[0].tipos, ['carne']);
  assert.equal(hoy.tapas[0].autor, 'cliente');

  const big = await fetch(`${url}/api/fotos/${hoy.tapas[0].foto}.jpg`);
  assert.equal(big.status, 200);
  assert.equal(big.headers.get('content-type'), 'image/jpeg');
});

test('cada persona pone una nota por tapa y día, y la puede cambiar', async () => {
  const { tapas: [t] } = await (await fetch(`${url}/api/hoy`)).json();
  assert.equal((await post('/api/voto', { tapa: t.id, nota: 6 })).status, 400);
  assert.deepEqual(await (await post('/api/voto', { tapa: t.id, nota: 4 })).json(), { votos: 1, media: 4, nota: 4 });
  assert.deepEqual(await (await post('/api/voto', { tapa: t.id, nota: 5 })).json(), { votos: 1, media: 5, nota: 5 });
  assert.deepEqual(await (await post('/api/voto', { tapa: t.id, nota: 2 }, '10.0.0.2')).json(), { votos: 2, media: 3.5, nota: 2 });
  const hoy = await (await fetch(`${url}/api/hoy`)).json();
  assert.equal(hoy.tapas[0].media, 3.5);
  const bar = hoy.bares.find((b) => b.id === t.bar);
  assert.equal(bar.votos, 2);
  assert.equal(bar.media, 3.5);
});

test('alta de un bar, su enlace y su panel', async () => {
  assert.equal((await post('/api/altas', { nombre: 'Taberna Dous', contacto: '600112233', lat: 43.0101, lon: -7.5577, osm: 'osm-n2' })).status, 201);
  assert.equal((await post('/api/altas', { nombre: 'Lejos', contacto: '600112233', lat: 40.4, lon: -3.7 })).status, 400);
  const page = await (await fetch(`${url}/api/admin?clave=${KEY}`)).text();
  const id = page.match(/value="aprobar-alta"><input type="hidden" name="id" value="([^"]+)"/)[1];
  const approved = await (await form({ accion: 'aprobar-alta', id })).text();
  const link = approved.match(/value="(https:\/\/tapas\.test\/#panel\/[^"]+)"/)[1];
  const [, barId, clave] = link.match(/#panel\/([^/]+)\/(.+)$/);
  assert.equal(barId, 'osm-n2'); // se queda con el id de OpenStreetMap
  assert.match(approved, /wa\.me\/34600112233/);

  const bad = await post('/api/panel', { bar: barId, clave: 'otra' });
  assert.equal(bad.status, 403);
  const panel = await (await post('/api/panel', { bar: barId, clave })).json();
  assert.equal(panel.bar.reg, true);

  clock += 60000;
  const up = await post('/api/tapas', { bar: barId, clave, nombre: 'Callos', tipos: ['cuchara'], nota: 'Hasta las 15:00', ...photo() });
  const body = await up.json();
  assert.equal(body.estado, 'publicada');
  assert.equal(body.tapa.nota, 'Hasta las 15:00');
  const hoy = await (await fetch(`${url}/api/hoy`)).json();
  assert.equal(hoy.tapas[0].nombre, 'Callos');
  assert.equal(hoy.bares.find((b) => b.id === barId).reg, true);
  assert.equal(hoy.bares.length, 2); // el bar dado de alta no sale repetido

  assert.equal((await post('/api/tapas/borrar', { bar: barId, clave, tapa: body.tapa.id })).status, 200);
  assert.equal((await (await fetch(`${url}/api/hoy`)).json()).tapas.length, 1);
});

test('un enlace de bar falso no publica nada', async () => {
  const res = await post('/api/tapas', { bar: 'osm-n2', clave: 'inventada', nombre: 'Trampa', ...photo() });
  assert.equal(res.status, 403);
});

test('rechaza fotos que no son JPEG y el campo trampa no guarda nada', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.repeat(20)).toString('base64');
  assert.equal((await post('/api/tapas', { bar: 'osm-n1', nombre: 'Mala', foto: svg, mini: svg }, '10.0.0.9')).status, 400);
  const trap = await post('/api/tapas', { bar: 'osm-n1', nombre: 'Bot', web: 'http://spam', ...photo() }, '10.0.0.9');
  assert.equal(trap.status, 201);
  const page = await (await fetch(`${url}/api/admin?clave=${KEY}`)).text();
  assert.doesNotMatch(page, /Bot/);
});

test('la página de moderación no se abre ni enseña la clave sin la clave', async () => {
  const res = await fetch(`${url}/api/admin?clave=mala`);
  assert.equal(res.status, 403);
  assert.doesNotMatch(await res.text(), new RegExp(KEY));
  const post403 = await fetch(`${url}/api/admin`, { method: 'POST', body: new URLSearchParams({ clave: 'mala', accion: 'publicar', id: 'x' }) });
  assert.equal(post403.status, 403);
  assert.doesNotMatch(await post403.text(), new RegExp(KEY));
});

test('una tapa de hace una semana ya no sale en la portada', async () => {
  clock += 8 * 86400000;
  assert.equal((await (await fetch(`${url}/api/hoy`)).json()).tapas.length, 0);
  const bar = await (await fetch(`${url}/api/bar/osm-n1`)).json();
  assert.equal(bar.tapas.length, 1); // en la ficha del bar sigue
});
