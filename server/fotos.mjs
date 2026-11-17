// Que Tapa!: las fotos. El móvil las reduce y las pasa a JPEG antes de enviarlas (así ya no llevan
// la ubicación ni el modelo del móvil); aquí solo se comprueba que de verdad son un JPEG de un tamaño
// razonable y se guardan en el volumen. Cada foto va en dos tamaños: la grande y la miniatura del mapa.
import crypto from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_FOTO = 1_500_000;
export const MAX_MINI = 120_000;

/** Ancho y alto de un JPEG leyendo sus marcadores, o null si no es un JPEG válido. */
export function jpegSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 200 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    let marker = buf[i + 1];
    while (marker === 0xff && i + 2 < buf.length) { i += 1; marker = buf[i + 1]; }
    if (marker === 0xd9 || marker === 0xda) return null; // fin o datos sin haber visto el tamaño
    if (marker >= 0xd0 && marker <= 0xd7) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    const isSOF = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSOF) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/** Convierte el texto base64 (con o sin «data:image/jpeg;base64,») en bytes, con tope. */
export function fromBase64(value, max) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/^data:image\/jpeg;base64,/, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(clean) || clean.length > Math.ceil(max / 3) * 4 + 4) return null;
  const buf = Buffer.from(clean, 'base64');
  return buf.length <= max ? buf : null;
}

/** Comprueba la foto grande y la miniatura. Devuelve los bytes o el motivo del rechazo. */
export function checkPhotos(foto, mini) {
  const big = fromBase64(foto, MAX_FOTO);
  const small = fromBase64(mini, MAX_MINI);
  if (!big || !small) return { error: 'foto demasiado grande o mal enviada' };
  const a = jpegSize(big);
  const b = jpegSize(small);
  if (!a || !b) return { error: 'la foto no es un JPEG' };
  if (Math.max(a.width, a.height) > 2600 || Math.min(a.width, a.height) < 200) return { error: 'tamaño de foto no válido' };
  if (Math.max(b.width, b.height) > 512 || Math.min(b.width, b.height) < 64) return { error: 'tamaño de miniatura no válido' };
  return { big, small };
}

export function createPhotos(dataDir) {
  const dir = join(dataDir, 'fotos');
  mkdirSync(dir, { recursive: true });
  const fileOf = (id, size) => join(dir, size === 'm' ? `${id}-m.jpg` : `${id}.jpg`);
  const validId = (id) => /^[a-f0-9]{24}$/.test(id);

  return {
    save({ big, small }) {
      const id = crypto.randomBytes(12).toString('hex');
      writeFileSync(fileOf(id), big, { mode: 0o644 });
      writeFileSync(fileOf(id, 'm'), small, { mode: 0o644 });
      return id;
    },
    remove(id) {
      if (!validId(id)) return;
      rmSync(fileOf(id), { force: true });
      rmSync(fileOf(id, 'm'), { force: true });
    },
    exists: (id) => validId(id) && existsSync(fileOf(id)),
    /** GET /api/fotos/<id>.jpg y /api/fotos/<id>-m.jpg. Cada foto tiene su propio nombre y nunca cambia. */
    handle(req, res, path) {
      const m = path.match(/^\/api\/fotos\/([a-f0-9]{24})(-m)?\.jpg$/);
      if (!m || req.method !== 'GET') return false;
      const file = fileOf(m[1], m[2] ? 'm' : '');
      if (!existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        res.end('no existe');
        return true;
      }
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': statSync(file).size,
        'Cache-Control': 'public, max-age=2592000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      createReadStream(file).pipe(res);
      return true;
    },
  };
}
