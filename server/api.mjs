// Que Tapa!: la API. Sirve los bares y las tapas, guarda las fotos, cuenta los «¡Que tapa!»,
// recibe las altas de bares y los mensajes, y tiene una página privada para moderar.
//
// Todo se guarda en ficheros JSON dentro de DATA_DIR (el volumen del contenedor). No hay cuentas:
// cada bar tiene un enlace privado con su clave para subir su tapa, y lo que suben los clientes
// no sale hasta que se aprueba en la página de moderación.
import crypto from 'node:crypto';
import http from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPORTES, adminPage } from './admin.mjs';

export { REPORTES };
import { checkPhotos, createPhotos } from './fotos.mjs';
import { createOSM } from './osm.mjs';
import {
  createLimiter, diasEntre, inLugo, jornada, loadJSON, newKey, readForm, readJSON, reply, sameSecret, saveJSON, slug, text,
} from './util.mjs';

export const TIPOS = ['carne', 'mar', 'cuchara', 'huevo', 'veggie', 'sin-gluten'];

const DIAS_HOY = 7; // La portada enseña lo de la última semana; la web separa lo de hoy.
const GUARDAR_DIAS = 180; // Historial de cada bar.
const PENDIENTE_DIAS = 3; // Lo que no se modera en 3 días se borra.
const MAX_SUBIDA = 2_700_000;
const MAX_BAR_DIA = 8;
const MAX_PENDIENTES_BAR = 6;

/** Lo público de una tapa: lo que ve cualquiera. */
const publicTapa = (t) => ({
  id: t.id, bar: t.bar, fecha: t.fecha, at: t.at, nombre: t.nombre, tipos: t.tipos, nota: t.nota, foto: t.foto, autor: t.autor, fuegos: t.fuegos,
});
const publicBar = (b, reg) => ({ id: b.id, nombre: b.nombre, lat: b.lat, lon: b.lon, dir: b.dir || '', reg, ...(b.insta ? { insta: b.insta } : {}) });

export function createApp({
  dataDir, now = Date.now, adminKey = '', notifyUrl = '', base = '', osm: osmOptions = {}, fetchImpl = fetch,
}) {
  const file = (name) => join(dataDir, name);
  const fotos = createPhotos(dataDir);
  const osm = osmOptions.instance ?? createOSM({ dataDir, now, fetchImpl, ...osmOptions });

  const keyPath = file('admin-clave.txt');
  let secret = adminKey && adminKey.length >= 12 ? adminKey : '';
  if (!secret) {
    if (!existsSync(keyPath)) writeFileSync(keyPath, newKey(), { mode: 0o600 });
    secret = readFileSync(keyPath, 'utf8').trim();
  }

  const load = (name) => { const v = loadJSON(file(name), []); return Array.isArray(v) ? v : []; };
  let bares = load('bares.json');
  let altas = load('altas.json');
  let tapas = load('tapas.json');
  let reportes = load('reportes.json');
  let ocultos = new Set(load('ocultos.json'));
  let dirty = false;

  const persist = {
    bares: () => saveJSON(file('bares.json'), bares),
    altas: () => saveJSON(file('altas.json'), altas),
    tapas: () => { saveJSON(file('tapas.json'), tapas); dirty = false; },
    reportes: () => saveJSON(file('reportes.json'), reportes),
    ocultos: () => saveJSON(file('ocultos.json'), [...ocultos]),
  };

  const subidas = createLimiter({ now, perHour: 6, perDay: 20 });
  const subidasBar = createLimiter({ now, perHour: 30, perDay: 60 });
  const altasLimit = createLimiter({ now, perHour: 3, perDay: 6 });
  const mensajes = createLimiter({ now, perHour: 6, perDay: 20 });
  const fuegosLimit = createLimiter({ now, perHour: 120, perDay: 400 });
  const paneles = createLimiter({ now, perHour: 60, perDay: 300 });
  let votos = { dia: '', vistos: new Set() };

  const registered = (id) => bares.find((b) => b.id === id) ?? null;
  /** Un bar por su id: los dados de alta mandan sobre los de OpenStreetMap. */
  function barById(id) {
    if (typeof id !== 'string' || ocultos.has(id)) return null;
    const reg = registered(id);
    if (reg) return { bar: reg, reg: true };
    const fromOsm = osm.get(id);
    return fromOsm ? { bar: fromOsm, reg: false } : null;
  }
  function allBars() {
    const regIds = new Set(bares.map((b) => b.id));
    return [
      ...bares.map((b) => publicBar(b, true)),
      ...osm.list().filter((b) => !regIds.has(b.id) && !ocultos.has(b.id)).map((b) => publicBar(b, false)),
    ];
  }

  function notify(title, body) {
    if (!notifyUrl) return;
    fetchImpl(notifyUrl, {
      method: 'POST',
      body,
      headers: { Title: title, Tags: 'fork_and_knife' },
      signal: AbortSignal.timeout(10000),
    }).catch((err) => console.warn(`[avisos] no se pudo avisar al móvil: ${err.message}`));
  }

  /** Borra lo viejo: tapas de hace más de medio año y lo que lleva días sin moderar. */
  function prune() {
    const hoy = jornada(now());
    const keep = [];
    for (const t of tapas) {
      const age = diasEntre(t.fecha, hoy);
      const old = t.estado === 'pendiente' ? age > PENDIENTE_DIAS : age > GUARDAR_DIAS;
      if (old) fotos.remove(t.foto); else keep.push(t);
    }
    if (keep.length !== tapas.length) { tapas = keep; persist.tapas(); }
    const oldest = now() - 180 * 86400000;
    const r = reportes.filter((x) => Date.parse(x.at) >= oldest);
    if (r.length !== reportes.length) { reportes = r; persist.reportes(); }
    const a = altas.filter((x) => Date.parse(x.at) >= oldest);
    if (a.length !== altas.length) { altas = a; persist.altas(); }
  }
  prune();

  function removeTapa(id) {
    const t = tapas.find((x) => x.id === id);
    if (!t) return false;
    tapas = tapas.filter((x) => x.id !== id);
    fotos.remove(t.foto);
    persist.tapas();
    return true;
  }

  const panelLink = (bar) => `${base}/#panel/${encodeURIComponent(bar.id)}/${bar.clave}`;

  /* ---------- Rutas públicas ---------- */

  function hoy(res) {
    const fecha = jornada(now());
    const recent = tapas
      .filter((t) => t.estado === 'publicada' && diasEntre(t.fecha, fecha) < DIAS_HOY && !ocultos.has(t.bar))
      .sort((a, b) => b.at.localeCompare(a.at))
      .map(publicTapa);
    return reply(res, 200, { fecha, bares: allBars(), tapas: recent }, 20);
  }

  function barInfo(res, id) {
    const found = barById(id);
    if (!found) return reply(res, 404, { error: 'no existe' });
    const list = tapas.filter((t) => t.bar === id && t.estado === 'publicada').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40).map(publicTapa);
    return reply(res, 200, { fecha: jornada(now()), bar: publicBar(found.bar, found.reg), tapas: list }, 20);
  }

  async function subir(req, res, from) {
    const { value, tooBig } = await readJSON(req, MAX_SUBIDA);
    if (tooBig) return reply(res, 413, { error: 'la foto pesa demasiado' });
    if (!value || typeof value !== 'object') return reply(res, 400, { error: 'datos no válidos' });
    if (typeof value.web === 'string' && value.web) return reply(res, 201, { ok: true, estado: 'pendiente' }); // campo trampa
    const found = barById(value.bar);
    if (!found) return reply(res, 400, { error: 'ese bar no está en el mapa' });
    const nombre = text(value.nombre, 60);
    if (nombre.length < 2) return reply(res, 400, { error: 'falta el nombre de la tapa' });
    const tipos = [...new Set(Array.isArray(value.tipos) ? value.tipos.filter((x) => TIPOS.includes(x)) : [])].slice(0, 3);
    const esBar = found.reg && sameSecret(value.clave, found.bar.clave);
    if (value.clave && !esBar) return reply(res, 403, { error: 'el enlace de tu bar no es válido' });
    const fecha = jornada(now());
    if (esBar) {
      if (!subidasBar.allow(from)) return reply(res, 429, { error: 'demasiadas fotos seguidas' });
      const today = tapas.filter((t) => t.bar === found.bar.id && t.fecha === fecha && t.autor === 'bar').length;
      if (today >= MAX_BAR_DIA) return reply(res, 429, { error: `hoy ya subiste ${MAX_BAR_DIA} tapas` });
    } else {
      if (!subidas.allow(from)) return reply(res, 429, { error: 'demasiadas fotos seguidas, prueba más tarde' });
      const waiting = tapas.filter((t) => t.bar === found.bar.id && t.estado === 'pendiente').length;
      if (waiting >= MAX_PENDIENTES_BAR) return reply(res, 429, { error: 'ya hay varias fotos de este bar esperando' });
    }
    const photos = checkPhotos(value.foto, value.mini);
    if (photos.error) return reply(res, 400, { error: photos.error });
    const tapa = {
      id: crypto.randomUUID(),
      bar: found.bar.id,
      fecha,
      at: new Date(now()).toISOString(),
      nombre,
      tipos,
      nota: esBar ? text(value.nota, 80) : '',
      foto: fotos.save(photos),
      autor: esBar ? 'bar' : 'cliente',
      estado: esBar ? 'publicada' : 'pendiente',
      fuegos: 0,
    };
    tapas.push(tapa);
    persist.tapas();
    if (!esBar) notify('Que Tapa!: foto para revisar', `${nombre} · ${found.bar.nombre}`);
    return reply(res, 201, { ok: true, estado: tapa.estado, ...(esBar ? { tapa: publicTapa(tapa) } : {}) });
  }

  async function fuego(req, res, from) {
    const { value } = await readJSON(req, 512);
    const t = tapas.find((x) => x.id === value?.tapa && x.estado === 'publicada');
    if (!t) return reply(res, 404, { error: 'no existe' });
    const dia = jornada(now());
    if (votos.dia !== dia) votos = { dia, vistos: new Set() };
    const key = `${fuegosLimit.source(from)}|${t.id}`;
    if (votos.vistos.has(key)) return reply(res, 200, { fuegos: t.fuegos, repetido: true });
    if (!fuegosLimit.allow(from)) return reply(res, 429, { error: 'demasiados' });
    if (votos.vistos.size > 200000) votos.vistos.clear();
    votos.vistos.add(key);
    t.fuegos += 1;
    dirty = true;
    return reply(res, 200, { fuegos: t.fuegos });
  }

  async function alta(req, res, from) {
    const { value } = await readJSON(req, 4096);
    if (!value || typeof value !== 'object') return reply(res, 400, { error: 'datos no válidos' });
    if (typeof value.web === 'string' && value.web) return reply(res, 201, { ok: true });
    const nombre = text(value.nombre, 60);
    const contacto = text(value.contacto, 120);
    const lat = Number(value.lat);
    const lon = Number(value.lon);
    if (nombre.length < 2 || contacto.length < 5) return reply(res, 400, { error: 'faltan el nombre o el contacto' });
    if (!inLugo(lat, lon)) return reply(res, 400, { error: 'el punto no está en Lugo' });
    if (!altasLimit.allow(from)) return reply(res, 429, { error: 'demasiadas altas seguidas' });
    const osmId = typeof value.osm === 'string' && osm.get(value.osm) ? value.osm : '';
    altas.push({
      id: crypto.randomUUID(),
      at: new Date(now()).toISOString(),
      nombre,
      dir: text(value.dir, 100),
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      contacto,
      mensaje: text(value.mensaje, 400),
      insta: text(value.insta, 40).replace(/^@/, '').replace(/[^\w.]/g, '').slice(0, 30),
      osm: osmId,
    });
    persist.altas();
    notify('Que Tapa!: nuevo bar', `${nombre}${osmId ? ' (ya estaba en el mapa)' : ''}`);
    return reply(res, 201, { ok: true });
  }

  function ownerOf(value, from) {
    if (!paneles.allow(from)) return { error: [429, 'demasiados intentos'] };
    const bar = registered(value?.bar);
    if (!bar || !sameSecret(value?.clave, bar.clave)) return { error: [403, 'el enlace de tu bar no es válido'] };
    return { bar };
  }

  async function panel(req, res, from) {
    const { value } = await readJSON(req, 1024);
    const { bar, error } = ownerOf(value, from);
    if (error) return reply(res, error[0], { error: error[1] });
    const fecha = jornada(now());
    const mine = tapas.filter((t) => t.bar === bar.id && t.estado === 'publicada').sort((a, b) => b.at.localeCompare(a.at));
    return reply(res, 200, {
      fecha,
      bar: publicBar(bar, true),
      tapas: mine.slice(0, 30).map(publicTapa),
      hoy: { tapas: mine.filter((t) => t.fecha === fecha).length, fuegos: mine.filter((t) => t.fecha === fecha).reduce((s, t) => s + t.fuegos, 0) },
      total: { tapas: mine.length, fuegos: mine.reduce((s, t) => s + t.fuegos, 0) },
    });
  }

  async function borrarPropia(req, res, from) {
    const { value } = await readJSON(req, 1024);
    const { bar, error } = ownerOf(value, from);
    if (error) return reply(res, error[0], { error: error[1] });
    const t = tapas.find((x) => x.id === value.tapa && x.bar === bar.id && x.autor === 'bar');
    if (!t) return reply(res, 404, { error: 'no existe' });
    removeTapa(t.id);
    return reply(res, 200, { ok: true });
  }

  async function reportar(req, res, from) {
    const { value } = await readJSON(req, 4096);
    if (!value || typeof value !== 'object') return reply(res, 400, { error: 'datos no válidos' });
    if (typeof value.web === 'string' && value.web) return reply(res, 201, { ok: true });
    const tipo = Object.hasOwn(REPORTES, value.tipo) ? value.tipo : 'otro';
    const texto = text(value.texto, 1000);
    const bar = barById(value.bar)?.bar ?? null;
    if (!texto && !bar) return reply(res, 400, { error: 'cuéntanos qué pasa' });
    if (!mensajes.allow(from)) return reply(res, 429, { error: 'demasiados mensajes' });
    const tapa = tapas.find((t) => t.id === value.tapa) ?? null;
    reportes.push({
      id: crypto.randomUUID(), at: new Date(now()).toISOString(), tipo, texto, contacto: text(value.contacto, 120),
      bar: bar?.id ?? '', barNombre: bar?.nombre ?? '', tapa: tapa?.id ?? '', tapaNombre: tapa?.nombre ?? '',
    });
    if (reportes.length > 1000) reportes = reportes.slice(-1000);
    persist.reportes();
    notify('Que Tapa!: algo no cuadra', `${REPORTES[tipo]}${bar ? ` · ${bar.nombre}` : ''}`);
    return reply(res, 201, { ok: true });
  }

  /* ---------- Moderación ---------- */

  function renderAdmin(res, status, aviso = null) {
    prune();
    const html = adminPage({
      clave: secret,
      aviso,
      pendientes: tapas.filter((t) => t.estado === 'pendiente').sort((a, b) => a.at.localeCompare(b.at)),
      recientes: tapas.filter((t) => t.estado === 'publicada').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40),
      altas: [...altas].reverse(),
      reportes: [...reportes].reverse(),
      bares: [...bares].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      ocultos: [...ocultos].map((id) => osm.get(id) ?? { id, nombre: id }),
      nombreDe: (id) => barById(id)?.bar.nombre ?? registered(id)?.nombre ?? id,
      panelLink,
      osmCount: osm.list().length,
    });
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    res.end(html);
    return true;
  }

  function adminAction(form) {
    const id = form.get('id') ?? '';
    switch (form.get('accion')) {
      case 'publicar': {
        const t = tapas.find((x) => x.id === id && x.estado === 'pendiente');
        if (!t) return null;
        t.estado = 'publicada';
        persist.tapas();
        return { tipo: 'ok', texto: `Publicada: ${t.nombre}` };
      }
      case 'borrar-tapa':
        return removeTapa(id) ? { tipo: 'ok', texto: 'Tapa borrada' } : null;
      case 'aprobar-alta': {
        const a = altas.find((x) => x.id === id);
        if (!a) return null;
        let barId = a.osm && !registered(a.osm) ? a.osm : '';
        while (!barId || registered(barId)) barId = `${slug(a.nombre)}-${crypto.randomBytes(2).toString('hex')}`;
        const bar = { id: barId, nombre: a.nombre, lat: a.lat, lon: a.lon, dir: a.dir, insta: a.insta, contacto: a.contacto, alta: new Date(now()).toISOString(), clave: newKey() };
        bares.push(bar);
        ocultos.delete(barId);
        altas = altas.filter((x) => x.id !== id);
        persist.bares();
        persist.altas();
        persist.ocultos();
        return { tipo: 'enlace', bar };
      }
      case 'borrar-alta':
        altas = altas.filter((x) => x.id !== id);
        persist.altas();
        return { tipo: 'ok', texto: 'Alta borrada' };
      case 'nueva-clave': {
        const bar = registered(id);
        if (!bar) return null;
        bar.clave = newKey();
        persist.bares();
        return { tipo: 'enlace', bar };
      }
      case 'ver-enlace': {
        const bar = registered(id);
        return bar ? { tipo: 'enlace', bar } : null;
      }
      case 'quitar-bar': {
        const wasRegistered = Boolean(registered(id));
        if (wasRegistered) {
          bares = bares.filter((b) => b.id !== id);
          persist.bares();
        }
        // Si también está en OpenStreetMap, se oculta para que no vuelva a salir al día siguiente.
        if (osm.get(id) || !wasRegistered) { ocultos.add(id); persist.ocultos(); }
        return { tipo: 'ok', texto: 'Bar quitado del mapa' };
      }
      case 'mostrar-bar':
        ocultos.delete(id);
        persist.ocultos();
        return { tipo: 'ok', texto: 'Bar otra vez en el mapa' };
      case 'reporte-hecho':
        reportes = reportes.filter((r) => r.id !== id);
        persist.reportes();
        return { tipo: 'ok', texto: 'Mensaje borrado' };
      default:
        return null;
    }
  }

  /** Sin la clave buena nunca se pinta la página: lleva la clave dentro de sus formularios. */
  function denied(res) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    res.end('Clave incorrecta. Sale en los registros del contenedor tapas-api al arrancar.');
    return true;
  }

  async function admin(req, res) {
    if (req.method === 'GET') {
      const given = new URL(req.url, 'http://x').searchParams.get('clave');
      return sameSecret(given, secret) ? renderAdmin(res, 200) : denied(res);
    }
    if (req.method === 'POST') {
      const form = await readForm(req, 4096);
      if (!form || !sameSecret(form.get('clave'), secret)) return denied(res);
      const aviso = adminAction(form);
      return renderAdmin(res, 200, aviso ?? { tipo: 'error', texto: 'Ya no existe (¿lo hiciste en otra pestaña?)' });
    }
    return reply(res, 405, { error: 'método no permitido' });
  }

  /* ---------- Servidor ---------- */

  async function handle(req, res) {
    const path = new URL(req.url, 'http://x').pathname;
    const from = String(req.headers['x-real-ip'] ?? req.socket.remoteAddress);
    if (path === '/health') return reply(res, 200, { ok: true });
    if (fotos.handle(req, res, path)) return true;
    if (path === '/api/admin') return admin(req, res);
    if (req.method === 'GET' && path === '/api/hoy') return hoy(res);
    const barMatch = path.match(/^\/api\/bar\/([\w-]{1,60})$/);
    if (req.method === 'GET' && barMatch) return barInfo(res, barMatch[1]);
    if (req.method === 'POST') {
      if (path === '/api/tapas') return subir(req, res, from);
      if (path === '/api/fuego') return fuego(req, res, from);
      if (path === '/api/altas') return alta(req, res, from);
      if (path === '/api/panel') return panel(req, res, from);
      if (path === '/api/tapas/borrar') return borrarPropia(req, res, from);
      if (path === '/api/reportes') return reportar(req, res, from);
    }
    return reply(res, 404, { error: 'no existe' });
  }

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.warn(`[api] ${err?.message}`);
      if (!res.headersSent) reply(res, 500, { error: 'error interno' });
    }
  });

  return {
    server,
    handle,
    osm,
    adminLink: () => `${base}/api/admin?clave=${encodeURIComponent(secret)}`,
    /** Cada poco: guarda los «¡Que tapa!» contados y limpia lo viejo. */
    flush() { if (dirty) persist.tapas(); },
    prune,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const env = process.env;
  const app = createApp({
    dataDir: env.DATA_DIR ?? '/data',
    adminKey: env.ADMIN_CLAVE || '',
    notifyUrl: env.NTFY_URL || '',
    base: (env.PUBLIC_URL || 'https://tapas.marcogugliandolo.com').replace(/\/+$/, ''),
    osm: { enabled: env.OSM !== '0', url: env.OVERPASS_URL || '' },
  });
  app.server.listen(3001, () => {
    console.log('[api] escuchando en 3001');
    console.log(`[admin] página de moderación: ${app.adminLink()}`);
  });
  setInterval(() => app.flush(), 10000);
  setInterval(() => app.prune(), 6 * 3600000);
  app.osm.tick();
  setInterval(() => app.osm.tick(), 3600000);
  const stop = () => { app.flush(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
