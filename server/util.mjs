// Que Tapa!: piezas pequeñas que usa toda la API (fechas de Lugo, ficheros, respuestas y límites).
import crypto from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

const madridFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** La fecha y la hora de Lugo en un instante. */
export function madrid(ms = Date.now()) {
  const p = Object.fromEntries(madridFormat.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * El día «de viños»: empieza a las 5 de la mañana. Una tapa subida a la 1 de la noche
 * cuenta para el día anterior, que es cuando la gente salió.
 */
export const JORNADA_HORAS = 5;
export const jornada = (ms = Date.now()) => madrid(ms - JORNADA_HORAS * 3600000).iso;

/** Días entre dos fechas AAAA-MM-DD (b - a). */
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

export function loadJSON(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

/** Escribe en un fichero temporal y lo cambia de nombre: nunca queda un JSON a medias. */
export function saveJSON(path, value, mode = 0o600) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { mode });
  renameSync(tmp, path);
}

export const reply = (res, status, value, maxAge = 0) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(value === undefined ? '' : JSON.stringify(value));
  return true;
};

/** Lee el cuerpo JSON de una petición con un tope de tamaño. */
export function readJSON(req, max) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    let done = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max && !done) { done = true; resolve({ tooBig: true }); req.destroy(); } else if (!done) chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try { resolve({ value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch { resolve({ value: null }); }
    });
    req.on('error', () => { if (!done) { done = true; resolve({ value: null }); } });
  });
}

/** Lee un formulario normal (application/x-www-form-urlencoded). */
export function readForm(req, max) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max) { resolve(null); req.destroy(); } else chunks.push(chunk);
    });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', () => resolve(null));
  });
}

/** Texto limpio: sin caracteres de control, sin espacios de sobra y con tope. */
export const text = (value, max) => (typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max)
  : '');

export const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const sameSecret = (given, secret) => {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(String(secret ?? ''));
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const newKey = (bytes = 18) => crypto.randomBytes(bytes).toString('base64url');

export function slug(name) {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bar';
}

/**
 * Cuenta lo que manda cada origen sin guardar quién es: la IP se mezcla con un secreto
 * que cambia cada día y solo se queda un resumen corto en memoria.
 */
export function createLimiter({ now = Date.now, perHour, perDay }) {
  let salt = { date: '', value: '' };
  const seen = new Map();
  const source = (ip) => {
    const day = madrid(now()).iso;
    if (salt.date !== day) { salt = { date: day, value: crypto.randomBytes(16).toString('hex') }; seen.clear(); }
    return crypto.createHash('sha256').update(`${salt.value}|${ip}`).digest('base64url').slice(0, 16);
  };
  return {
    source,
    allow(ip) {
      const who = source(ip);
      const hour = Math.floor(now() / 3600000);
      const s = seen.get(who) ?? { hour, inHour: 0, inDay: 0 };
      if (s.hour !== hour) { s.hour = hour; s.inHour = 0; }
      if (s.inHour >= perHour || s.inDay >= perDay) return false;
      s.inHour += 1;
      s.inDay += 1;
      if (seen.size > 5000) seen.clear();
      seen.set(who, s);
      return true;
    },
  };
}

export const inLugo = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat > 42.9 && lat < 43.12 && lon > -7.7 && lon < -7.4;
