// Que Tapa!: rutas a pie por las calles de Lugo, calculadas en el propio móvil.
// Usa el mismo callejero que dibuja el mapa sin conexión (data/streets.json, de OpenStreetMap),
// así que no hace falta ningún servicio de fuera. Sin dependencias del navegador, para poder
// comprobarlo con node (tools/check-ruta.mjs).

const KX = 111320 * Math.cos((43.01 * Math.PI) / 180); // metros por grado de longitud en Lugo
const KY = 110540; // metros por grado de latitud
const CELL = 0.002; // unos 160 x 220 m

export const METROS_POR_MINUTO = 75; // unos 4,5 km/h, como en Xa Vén
export const minutosAPie = (metros) => Math.max(1, Math.round(metros / METROS_POR_MINUTO));

export const metres = (aLon, aLat, bLon, bLat) => Math.hypot((aLon - bLon) * KX, (aLat - bLat) * KY);

/** El callejero como grafo: un nodo por cruce o punto de calle y sus tramos con la distancia. */
export function buildGraph(geojson) {
  const lines = geojson?.geometry?.coordinates ?? [];
  const index = new Map();
  const lon = [];
  const lat = [];
  const adj = [];
  const node = (p) => {
    const key = `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
    let i = index.get(key);
    if (i === undefined) {
      i = lon.length;
      index.set(key, i);
      lon.push(p[0]);
      lat.push(p[1]);
      adj.push([]);
    }
    return i;
  };
  for (const line of lines) {
    let prev = node(line[0]);
    for (let k = 1; k < line.length; k += 1) {
      const cur = node(line[k]);
      if (cur !== prev) {
        const d = metres(lon[prev], lat[prev], lon[cur], lat[cur]);
        adj[prev].push(cur, d);
        adj[cur].push(prev, d);
      }
      prev = cur;
    }
  }
  const grid = new Map();
  for (let i = 0; i < lon.length; i += 1) {
    const key = `${Math.floor(lon[i] / CELL)},${Math.floor(lat[i] / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  return { lon, lat, adj, grid };
}

/** El punto del callejero más cercano (en un radio de unos 500 m), o -1. */
export function nearestNode(g, lonP, latP) {
  const cx = Math.floor(lonP / CELL);
  const cy = Math.floor(latP / CELL);
  let best = -1;
  let bestD = Infinity;
  for (let ring = 0; ring <= 3; ring += 1) {
    for (let x = cx - ring; x <= cx + ring; x += 1) {
      for (let y = cy - ring; y <= cy + ring; y += 1) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== ring) continue;
        for (const i of g.grid.get(`${x},${y}`) ?? []) {
          const d = metres(lonP, latP, g.lon[i], g.lat[i]);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    if (best !== -1 && ring >= 1) break;
  }
  return best;
}

/** Montón binario pequeño para el A*. */
class Heap {
  constructor() { this.ids = []; this.keys = []; }
  get size() { return this.ids.length; }
  push(id, key) {
    const { ids, keys } = this;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p];
      i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop() {
    const { ids, keys } = this;
    const top = ids[0];
    const lastId = ids.pop();
    const lastKey = keys.pop();
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c += 1;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c]; keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId; keys[i] = lastKey;
    }
    return top;
  }
}

/**
 * La ruta a pie más corta entre dos puntos [lon, lat]. Devuelve { coords, metros } o null si
 * alguno de los dos está lejos del callejero o no hay camino.
 */
export function walkRoute(g, from, to) {
  const a = nearestNode(g, from[0], from[1]);
  const b = nearestNode(g, to[0], to[1]);
  if (a === -1 || b === -1) return null;
  const n = g.lon.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const h = (i) => metres(g.lon[i], g.lat[i], g.lon[b], g.lat[b]);
  const heap = new Heap();
  dist[a] = 0;
  heap.push(a, h(a));
  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    if (u === b) break;
    done[u] = 1;
    const edges = g.adj[u];
    for (let k = 0; k < edges.length; k += 2) {
      const v = edges[k];
      const nd = dist[u] + edges[k + 1];
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        heap.push(v, nd + h(v));
      }
    }
  }
  if (!Number.isFinite(dist[b])) return null;
  const path = [];
  for (let i = b; i !== -1; i = prev[i]) path.push([g.lon[i], g.lat[i]]);
  path.reverse();
  const coords = [from, ...path, to];
  return { coords, metros: lengthOf(coords) };
}

export function lengthOf(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) total += metres(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  return total;
}

/**
 * Dónde está uno respecto a la ruta: a cuántos metros de ella y cuánto le queda hasta el final,
 * contando desde el punto de la ruta más cercano.
 */
export function progressOn(coords, lonP, latP) {
  let best = { off: Infinity, seg: 0, t: 0 };
  for (let i = 1; i < coords.length; i += 1) {
    const [ax, ay] = coords[i - 1];
    const [bx, by] = coords[i];
    const dx = (bx - ax) * KX;
    const dy = (by - ay) * KY;
    const px = (lonP - ax) * KX;
    const py = (latP - ay) * KY;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
    const off = Math.hypot(px - t * dx, py - t * dy);
    if (off < best.off) best = { off, seg: i, t };
  }
  const [ax, ay] = coords[best.seg - 1] ?? coords[0];
  const [bx, by] = coords[best.seg] ?? coords[0];
  const onLon = ax + (bx - ax) * best.t;
  const onLat = ay + (by - ay) * best.t;
  const rest = [[onLon, onLat], ...coords.slice(best.seg)];
  return { off: best.off, left: lengthOf(rest), rest };
}
