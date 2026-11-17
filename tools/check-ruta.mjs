// Comprueba las rutas a pie con el callejero de verdad.
//   node tools/check-ruta.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGraph, minutosAPie, progressOn, walkRoute } from '../app/ruta.js';

const streets = JSON.parse(readFileSync(new URL('../app/data/streets.json', import.meta.url), 'utf8'));
let t = performance.now();
const g = buildGraph(streets);
console.log(`Callejero: ${g.lon.length} puntos en ${Math.round(performance.now() - t)} ms`);

const casos = [
  ['Praza Maior → Rúa Nova', [-7.5561, 43.0093], [-7.5571, 43.0121]],
  ['Praza do Campo → A Milagrosa', [-7.5578, 43.0102], [-7.5452, 43.0185]],
  ['Estación de autobuses → Catedral', [-7.5524, 43.0066], [-7.5586, 43.0094]],
  ['Campus → Praza Maior', [-7.5413, 43.0214], [-7.5561, 43.0093]],
];
for (const [nombre, a, b] of casos) {
  t = performance.now();
  const r = walkRoute(g, a, b);
  const ms = Math.round(performance.now() - t);
  assert.ok(r, `${nombre}: sin ruta`);
  const recto = Math.hypot((a[0] - b[0]) * 81415, (a[1] - b[1]) * 110540);
  assert.ok(r.metros >= recto * 0.98 && r.metros < recto * 2.5, `${nombre}: ${Math.round(r.metros)} m para ${Math.round(recto)} m en línea recta`);
  const mid = r.coords[Math.floor(r.coords.length / 2)];
  const p = progressOn(r.coords, mid[0], mid[1]);
  assert.ok(p.off < 1 && p.left < r.metros, `${nombre}: progreso mal`);
  console.log(`${nombre}: ${Math.round(r.metros)} m (${minutosAPie(r.metros)} min), ${r.coords.length} puntos, ${ms} ms`);
}
assert.equal(walkRoute(g, [-3.7, 40.4], [-7.5561, 43.0093]), null, 'desde Madrid no hay ruta a pie por Lugo');
console.log('Rutas bien.');
