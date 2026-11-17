// Que Tapa!: los bares, cafeterías y restaurantes de Lugo que hay en OpenStreetMap.
// Una vez al día se piden a Overpass y se guardan en el volumen. Así el mapa tiene todos los sitios
// aunque todavía no se hayan dado de alta: cualquiera puede subir la tapa que le pusieron en uno.
// Si la descarga falla, se sigue con lo último que había. Datos © colaboradores de OpenStreetMap (ODbL).
import { join } from 'node:path';
import { loadJSON, saveJSON, text } from './util.mjs';

// Sur, oeste, norte, este: la ciudad y los barrios de alrededor.
export const BBOX = [42.985, -7.6, 43.045, -7.505];
const KINDS = ['bar', 'pub', 'cafe', 'restaurant'];
const DAY = 86400000;

export function overpassQuery(bbox = BBOX) {
  return `[out:json][timeout:60];nwr["amenity"~"^(${KINDS.join('|')})$"]["name"](${bbox.join(',')});out center tags;`;
}

/** De la respuesta de Overpass a la lista que usa la web: id, nombre, punto, dirección y tipo. */
export function parseOverpass(data) {
  const out = [];
  const seen = new Set();
  for (const el of data?.elements ?? []) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const nombre = text(tags.name, 60);
    if (!nombre || !Number.isFinite(lat) || !Number.isFinite(lon) || !KINDS.includes(tags.amenity)) continue;
    const id = `osm-${String(el.type ?? 'n')[0]}${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const calle = text(tags['addr:street'], 60);
    const numero = text(tags['addr:housenumber'], 10);
    out.push({
      id,
      nombre,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      dir: calle ? `${calle}${numero ? `, ${numero}` : ''}` : '',
      tipo: tags.amenity,
    });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function createOSM({ dataDir, now = Date.now, enabled = true, url = '', fetchImpl = fetch }) {
  const path = join(dataDir, 'osm-bares.json');
  let saved = loadJSON(path, { at: 0, bares: [] });
  if (!Array.isArray(saved?.bares)) saved = { at: 0, bares: [] };
  let byId = new Map(saved.bares.map((b) => [b.id, b]));
  let busy = false;

  async function tick() {
    if (!enabled || busy || now() - saved.at < DAY) return false;
    busy = true;
    try {
      const res = await fetchImpl(url || 'https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: new URLSearchParams({ data: overpassQuery() }),
        headers: { 'User-Agent': 'QueTapa/1.0 (tapas de Lugo; https://github.com/marcogugliandolo/tapas)' },
        signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) throw new Error(`Overpass respondió ${res.status}`);
      const bares = parseOverpass(await res.json());
      // Una respuesta vacía casi siempre es un fallo de Overpass: mejor seguir con lo que había.
      if (bares.length < 10 && saved.bares.length > 10) throw new Error(`solo ${bares.length} sitios`);
      saved = { at: now(), bares };
      byId = new Map(bares.map((b) => [b.id, b]));
      saveJSON(path, saved, 0o644);
      console.log(`[osm] ${bares.length} bares y restaurantes de OpenStreetMap`);
      return true;
    } catch (err) {
      console.warn(`[osm] no se pudo actualizar: ${err?.message}. Sigo con ${saved.bares.length}.`);
      // Se vuelve a intentar dentro de unas horas, no en cada vuelta.
      saved = { ...saved, at: now() - DAY + 3 * 3600000 };
      return false;
    } finally {
      busy = false;
    }
  }

  return { tick, list: () => saved.bares, get: (id) => byId.get(id) ?? null };
}
