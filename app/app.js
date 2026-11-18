// Que Tapa!: el mapa de las tapas de Lugo. Una sola página: el mapa con las fotos de las tapas
// de hoy y un panel (abajo en el móvil, a la izquierda en el ordenador) con lo demás.
// Las pantallas se abren con la dirección (#bar/…, #subir, #alta, #panel, #reportar), así el botón
// «atrás» del móvil funciona y cualquier bar se puede compartir con un enlace.
import { t, getLang, setLang, translateDom } from './i18n.js';

const API = '/api';
const CENTER = [-7.5566, 43.0108];
const TILES_CHECK = 'https://tiles.openfreemap.org/planet';
// /?ejemplo: todo de ejemplo y no se envía nada (para enseñarla sin tocar nada de verdad).
const DEMO = /[?&](ejemplo|exemplo)\b/.test(location.search);
// Mientras los bares empiezan a subir sus tapas, la portada pone tapas de ejemplo en los que aún no
// tienen. Cuando un bar sube la suya, la de verdad sustituye al ejemplo. /?real la enseña sin ejemplos.
const EJEMPLOS_EN_PORTADA = true;
const EJEMPLOS = DEMO || (EJEMPLOS_EN_PORTADA && !/[?&]real\b/.test(location.search));
const MAX_SIDE = 1280;
const MINI_SIDE = 240;

export const TIPOS = {
  carne: 'Carne',
  mar: 'Del mar',
  cuchara: 'De cuchara',
  huevo: 'Huevo y tortilla',
  veggie: 'Vegetariana',
  'sin-gluten': 'Sin gluten',
};
const IDEAS = ['Raxo', 'Callos', 'Tortilla', 'Pulpo', 'Zorza', 'Empanada', 'Croquetas', 'Oreja', 'Liscos', 'Calamares', 'Lacón', 'Pimientos'];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = matchMedia('(min-width: 1000px), (min-width: 600px) and (max-height: 540px) and (orientation: landscape)');

const state = {
  view: 'home',
  fecha: '',
  bares: [],
  barById: new Map(),
  tapas: [],
  latest: new Map(),
  loaded: false,
  version: 0,
  offline: false,
  pendingTapa: null,
  filter: 'todas',
  barId: null,
  bar: null, // lo que llega de /api/bar/<id>: el historial completo
  tapaId: null,
  query: '',
  me: null,
  favs: [],
  notas: {}, // las notas que has puesto: { idTapa: { nota, fecha } }
  mine: null,
  upload: null,
  alta: null,
  panel: null,
  report: null,
  confirmDelete: null,
  installPrompt: null,
  tour: null, // la ruta de tapas: { status, start, startName, stops: [{ bar, tapa, metros }], coords, metros, seed }
  nav: null, // la ruta a pie abierta: { bar, status, coords, metros, left, following, arrived }
};
let navigated = false;

/* ---------- Lo que se guarda en el móvil ---------- */
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* solo esta visita */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* nada */ } },
};
// Los bares que sigues (antes «tus bares»): se guardan en el móvil y el servidor solo cuenta cuántos.
state.favs = store.get('quetapa-favs', []).filter((x) => typeof x === 'string').slice(0, 60);
// Un número al azar de este móvil, para que el servidor cuente seguidores sin pedir cuenta.
state.deviceId = store.get('quetapa-id', '') || (() => {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
  store.set('quetapa-id', id);
  return id;
})();
// Las historias que ya abriste hoy (salen con el aro gris).
state.vistos = new Set(store.get('quetapa-vistos', []));
state.tab = 'todo';
state.feedN = 8;
state.notas = store.get('quetapa-notas', {});
state.mine = store.get('quetapa-mibar', null);

/* ---------- Fechas y textos ---------- */
// Los nombres van escritos aquí: no todos los navegadores traen el gallego en Intl.
const DIAS = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  gl: ['domingo', 'luns', 'martes', 'mércores', 'xoves', 'venres', 'sábado'],
};
const MESES = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  gl: ['xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño', 'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro'],
};
function dayLabel(fecha) {
  if (!fecha) return '';
  const d = new Date(`${fecha}T12:00:00Z`);
  const lang = getLang();
  const s = `${DIAS[lang][d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[lang][d.getUTCMonth()]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
function ago(tapa) {
  const days = state.fecha ? daysBetween(tapa.fecha, state.fecha) : 0;
  if (days >= 2) return t('hace {n} días', { n: days });
  if (days === 1) return t('ayer');
  const min = Math.max(0, Math.round((Date.now() - Date.parse(tapa.at)) / 60000));
  if (min < 2) return t('ahora mismo');
  if (min < 60) return t('hace {n} min', { n: min });
  return t('hace {n} h', { n: Math.round(min / 60) });
}
const isToday = (tapa) => tapa.fecha === state.fecha;
const isNew = (tapa) => isToday(tapa) && Date.now() - Date.parse(tapa.at) < 2 * 3600000;
const plural = (n, one, many) => (n === 1 ? t(one) : t(many, { n }));
const src = (tapa, mini = false) => (tapa.img ? (mini ? tapa.mini ?? tapa.img : tapa.img) : `${API}/fotos/${tapa.foto}${mini ? '-m' : ''}.jpg`);
const tipoLabel = (k) => t(TIPOS[k]);

function distance(a, b) {
  const k = Math.cos((a.lat * Math.PI) / 180) * 111320;
  return Math.hypot((a.lon - b.lon) * k, (a.lat - b.lat) * 110540);
}
const distanceText = (m) => (m < 1000 ? t('a {n} m', { n: Math.max(10, Math.round(m / 10) * 10) }) : t('a {n} km', { n: (m / 1000).toFixed(1).replace('.', ',') }));

/* ---------- Datos ---------- */
function apply(data) {
  state.fecha = data.fecha;
  state.bares = Array.isArray(data.bares) ? data.bares : [];
  state.barById = new Map(state.bares.map((b) => [b.id, b]));
  state.tapas = (Array.isArray(data.tapas) ? data.tapas : []).filter((x) => state.barById.has(x.bar));
  state.latest = new Map();
  for (const tapa of state.tapas) {
    const prev = state.latest.get(tapa.bar);
    if (!prev || tapa.at > prev.at) state.latest.set(tapa.bar, tapa);
  }
  state.loaded = true;
  state.version += 1;
  for (const [id, n] of Object.entries(state.notas)) if (!n?.fecha || daysBetween(n.fecha, state.fecha) > 7) delete state.notas[id];
  store.set('quetapa-notas', state.notas);
}

/** Los datos del servidor con las tapas de ejemplo puestas en los bares que no tienen. */
async function withExamples(data) {
  if (!EJEMPLOS) return data;
  try {
    const { demoData } = await import('./demo.js');
    return demoData(data.bares ?? [], { tapasReales: DEMO ? [] : data.tapas ?? [], fecha: data.fecha, notas: state.notas });
  } catch { return data; }
}

async function loadToday({ quiet = false } = {}) {
  if (DEMO) {
    // Con los bares de verdad del servidor, los del ejemplo salen en su sitio exacto.
    let bares = [];
    try { const res = await fetch(`${API}/hoy`, { cache: 'no-store' }); if (res.ok) bares = (await res.json()).bares ?? []; } catch { /* sin servidor: posiciones aproximadas */ }
    apply(await withExamples({ bares, tapas: [] }));
  } else {
    try {
      const res = await fetch(`${API}/hoy`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      apply(await withExamples(data));
      state.offline = false;
      store.set('quetapa-hoy', data);
    } catch {
      const saved = store.get('quetapa-hoy', null);
      if (saved && !state.loaded) apply(await withExamples(saved));
      state.offline = true;
      state.loaded = true;
    }
  }
  updateMap();
  if (!quiet || ['home', 'bar', 'search'].includes(state.view)) render();
}

async function loadBar(id) {
  if (DEMO) {
    state.bar = { bar: state.barById.get(id), tapas: state.tapas.filter((x) => x.bar === id) };
    return;
  }
  try {
    const res = await fetch(`${API}/bar/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      // Un bar sin tapas de verdad se queda con las de ejemplo que ya tenía.
      const examples = state.tapas.filter((x) => x.bar === id && x.autor === 'ejemplo');
      if (state.barId === id) state.bar = !data.tapas?.length && examples.length ? { bar: state.barById.get(id) ?? data.bar, tapas: examples } : data;
      if (!state.barById.has(id)) state.barById.set(id, data.bar);
    }
  } catch { /* con lo de la portada vale */ }
}

const errorText = (err) => { const m = t(err?.message || 'No se pudo enviar. Prueba otra vez.'); return m.charAt(0).toUpperCase() + m.slice(1); };

async function postJSON(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new Error(data?.error || t('No se pudo enviar. Prueba otra vez.'));
    err.status = res.status;
    throw err;
  }
  return data ?? {};
}

/* ---------- Avisos cortos ---------- */
let toastTimer = 0;
function toast(text, ms = 3200) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------- Tema ---------- */
const SUN = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"></circle><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"></path></svg>';
const MOON = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path></svg>';
const isDark = () => {
  const forced = document.documentElement.dataset.theme;
  return forced ? forced === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
function paintThemeButton() {
  const dark = isDark();
  const button = $('#theme');
  button.innerHTML = dark ? SUN : MOON;
  button.setAttribute('aria-label', dark ? t('Cambiar a modo claro') : t('Cambiar a modo oscuro'));
  button.title = dark ? t('Modo claro') : t('Modo oscuro');
}
function setTheme(value) {
  document.documentElement.dataset.theme = value;
  try { localStorage.setItem('quetapa-tema', value); } catch { /* solo esta visita */ }
  paintThemeButton();
  applyMapTheme();
}

/* ---------- Mapa ---------- */
let map = null;
let mapReady = false;
let streetsData = null;
const loadStreets = async () => (streetsData ??= await fetch('data/streets.json').then((r) => { if (!r.ok) throw new Error('calles'); return r.json(); }));
let userMoved = false;
let themeTable = null;
const themeName = () => (isDark() ? 'dark' : 'light');

function paintStyle(style) {
  for (const layer of style.layers) {
    const paint = themeTable[themeName()][layer.id];
    if (!paint) continue;
    layer.paint ??= {};
    for (const [key, value] of Object.entries(paint)) {
      if (value === null) delete layer.paint[key];
      else layer.paint[key] = value;
    }
  }
  return style;
}

function applyMapTheme() {
  if (!mapReady) return;
  for (const [id, paint] of Object.entries(themeTable[themeName()])) {
    if (!map.getLayer(id)) continue;
    for (const [key, value] of Object.entries(paint)) map.setPaintProperty(id, key, value);
  }
  map.setPaintProperty('bares-dot', 'circle-stroke-color', isDark() ? '#1B1F24' : '#FFFFFF');
  map.setPaintProperty('ruta-casing', 'line-color', isDark() ? '#1B1F24' : '#FFFFFF');
  map.setPaintProperty('ruta-line', 'line-color', isDark() ? '#FF6A4D' : '#E4472B');
  map.setPaintProperty('bares-dot', 'circle-color', ['case', ['==', ['get', 'reg'], 1], '#E4472B', isDark() ? '#8A939B' : '#7C858D']);
}

async function buildStyle(remote) {
  if (remote) {
    const { style, themes } = await fetch('data/map-style.json').then((r) => r.json());
    themeTable = themes;
    return paintStyle(style);
  }
  // Sin el mapa de fuera (sin conexión o bloqueado): las calles de Lugo, guardadas en la web.
  const streets = await loadStreets();
  themeTable = {
    light: { bg: { 'background-color': '#E7E9E6' }, streets: { 'line-color': '#FFFFFF' } },
    dark: { bg: { 'background-color': '#14171B' }, streets: { 'line-color': '#2A3037' } },
  };
  return {
    version: 8,
    sources: { streets: { type: 'geojson', data: streets, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
    layers: [
      { id: 'bg', type: 'background', paint: themeTable[themeName()].bg },
      { id: 'streets', type: 'line', source: 'streets', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { ...themeTable[themeName()].streets, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 2, 18, 8] } },
    ],
  };
}

function barsGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: state.bares.map((b) => ({ type: 'Feature', properties: { id: b.id, reg: b.reg ? 1 : 0 }, geometry: { type: 'Point', coordinates: [b.lon, b.lat] } })),
  };
}

function addOverlays() {
  shownVersion = state.version;
  map.addSource('ruta', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'ruta-casing', type: 'line', source: 'ruta', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': isDark() ? '#1B1F24' : '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 6, 17, 11] } });
  map.addLayer({ id: 'ruta-line', type: 'line', source: 'ruta', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': isDark() ? '#FF6A4D' : '#E4472B', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 6] } });
  map.addSource('bares', { type: 'geojson', data: barsGeoJSON() });
  map.addLayer({
    id: 'bares-dot',
    type: 'circle',
    source: 'bares',
    minzoom: 13.2,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13.2, 2.5, 15, ['case', ['==', ['get', 'reg'], 1], 6, 4.5], 18, ['case', ['==', ['get', 'reg'], 1], 9, 7]],
      'circle-color': ['case', ['==', ['get', 'reg'], 1], '#E4472B', isDark() ? '#8A939B' : '#7C858D'],
      'circle-stroke-color': isDark() ? '#1B1F24' : '#FFFFFF',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13.2, 1, 16, 2],
    },
  });
  mapReady = true;
  applyMapTheme();
  updateMap();
  if (state.nav?.coords) drawRoute(state.nav.following ? state.nav.rest ?? state.nav.coords : state.nav.coords);
  // El mapa puede tardar más que los datos: al estar listo, se va al bar abierto o se centra Lugo.
  const bar = state.view === 'bar' ? state.barById.get(state.barId) : null;
  if (bar) setTimeout(() => flyTo(bar.lon, bar.lat), 60);
  else if (state.loaded) setTimeout(recenter, 120);
}

async function initMap() {
  try {
    if (typeof maplibregl === 'undefined') throw new Error('sin MapLibre');
    const remote = await fetch(TILES_CHECK, { signal: AbortSignal.timeout(2500) }).then((r) => r.ok).catch(() => false);
    map = new maplibregl.Map({
      container: 'map',
      style: await buildStyle(remote),
      center: CENTER,
      zoom: desktop.matches ? 15.4 : 14.7,
      padding: mapPadding(),
      attributionControl: false,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      fadeDuration: 80,
      renderWorldCopies: false,
      validateStyle: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 18.5,
      minZoom: 11,
    });
    map.touchZoomRotate.disableRotation();
    new ResizeObserver(() => map.resize()).observe($('#map'));
    map.on('style.load', addOverlays);
    map.on('click', 'bares-dot', (e) => { const id = e.features?.[0]?.properties?.id; if (id) go(`bar/${id}`); });
    map.on('mouseenter', 'bares-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'bares-dot', () => { map.getCanvas().style.cursor = ''; });
    map.on('move', scheduleDeclutter);
    map.on('dragstart', () => { userMoved = true; });
    map.on('zoomstart', (e) => { if (e.originalEvent) userMoved = true; });
    map.on('zoom', () => document.body.toggleAttribute('data-labels', map.getZoom() >= 16.2));
    map.on('error', (e) => console.warn('Mapa:', e.error?.message));
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyMapTheme(); paintThemeButton(); });
  } catch (err) {
    console.error(err);
    $('#nomap').hidden = false;
  }
}

function mapPadding() {
  const sheet = desktop.matches ? 0 : Math.min($('#sheet').getBoundingClientRect().height, window.innerHeight * 0.6);
  const side = desktop.matches ? $('.side').getBoundingClientRect().width : 0;
  return { top: desktop.matches ? 40 : 80, bottom: sheet + 20, left: side + 30, right: 30 };
}

/** Al cargar, el panel crece: se vuelve a centrar Lugo en el hueco que queda, si nadie ha tocado el mapa. */
function recenter() {
  if (!map || userMoved || state.view !== 'home') return;
  map.easeTo({ center: CENTER, padding: mapPadding(), duration: 0 });
}

function flyTo(lon, lat, zoom = 16.4) {
  if (!map) return;
  map.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), zoom), padding: mapPadding(), duration: reduced ? 0 : 650 });
}

const pins = new Map();
let ghost = null;
let mePin = null;

/** MapLibre mueve el marcador con su propio `transform`: la chincheta va dentro para poder crecer. */
function pinElement(bar) {
  const wrap = document.createElement('div');
  wrap.className = 'pin-wrap';
  wrap.innerHTML = '<button type="button" class="pin"><span class="ring"><img alt="" decoding="async"></span><span class="fl" hidden></span><span class="pin-name"></span></button>';
  wrap.firstChild.addEventListener('click', (e) => { e.stopPropagation(); go(`bar/${bar.id}`); });
  return wrap;
}

function paintPin(entry, bar, tapa, rank) {
  const { wrap } = entry;
  const el = wrap.firstChild;
  const today = isToday(tapa);
  const sel = state.barId === bar.id && (state.view === 'bar' || state.view === 'route');
  el.classList.toggle('old', !today);
  el.classList.toggle('sel', sel);
  wrap.classList.toggle('sel', sel);
  wrap.classList.toggle('today', today);
  const img = el.querySelector('img');
  const want = src(tapa, true);
  if (img.getAttribute('src') !== want) img.src = want;
  const fl = el.querySelector('.fl');
  fl.hidden = !(tapa.votos > 0);
  fl.innerHTML = `${STAR_FILL}${fmtMedia(tapa.media)}`;
  el.querySelector('.pin-name').textContent = bar.nombre;
  el.setAttribute('aria-label', `${tapa.nombre} · ${bar.nombre}`);
  entry.rank = (today ? 0 : 1000) + rank;
}

let shownVersion = -1;
function updateMap() {
  if (!mapReady) return;
  if (shownVersion !== state.version) {
    shownVersion = state.version;
    map.getSource('bares')?.setData(barsGeoJSON());
  }
  const ranked = [...state.latest.values()].filter(isToday).sort(byRating);
  const rankOf = new Map(ranked.map((x, i) => [x.id, i]));
  const keep = new Set();
  for (const [barId, tapa] of state.latest) {
    const bar = state.barById.get(barId);
    if (!bar) continue;
    keep.add(barId);
    let entry = pins.get(barId);
    if (!entry) {
      const wrap = pinElement(bar);
      const marker = new maplibregl.Marker({ element: wrap, anchor: 'bottom' }).setLngLat([bar.lon, bar.lat]).addTo(map);
      entry = { wrap, marker, lngLat: [bar.lon, bar.lat] };
      pins.set(barId, entry);
    }
    paintPin(entry, bar, tapa, rankOf.get(tapa.id) ?? 99);
  }
  for (const [barId, entry] of pins) {
    if (!keep.has(barId)) { entry.marker.remove(); pins.delete(barId); }
  }
  // El bar abierto sin tapa: una chincheta propia para saber dónde está.
  const selected = (state.view === 'bar' || state.view === 'route') && state.barId && !pins.has(state.barId) ? state.barById.get(state.barId) : null;
  if (selected) {
    if (!ghost) {
      const el = document.createElement('div');
      el.className = 'pin-wrap sel';
      el.innerHTML = '<span class="pin ghost sel"><span class="ring"><span class="emo"></span></span></span>';
      ghost = new maplibregl.Marker({ element: el, anchor: 'bottom' });
    }
    ghost.setLngLat([selected.lon, selected.lat]).addTo(map);
  } else ghost?.remove();
  if (state.me) {
    if (!mePin) {
      const el = document.createElement('div');
      el.className = 'me';
      mePin = new maplibregl.Marker({ element: el });
    }
    mePin.setLngLat([state.me.lon, state.me.lat]).addTo(map);
  }
  declutter();
}

/** Si dos fotos se tapan, se queda la mejor valorada de hoy (y siempre la del bar abierto). */
let declutterQueued = false;
function scheduleDeclutter() {
  if (declutterQueued) return;
  declutterQueued = true;
  requestAnimationFrame(() => { declutterQueued = false; declutter(); });
}
function declutter() {
  if (!map) return;
  const shown = [];
  const must = new Set([state.barId, ...(state.tour?.stops ?? []).map((x) => x.bar.id)].filter(Boolean));
  const list = [...pins.entries()].sort((a, b) => (must.has(b[0]) - must.has(a[0])) || a[1].rank - b[1].rank);
  // De lejos, solo las mejores fotos y más separadas; el resto de bares se quedan como puntos.
  const z = map.getZoom();
  const gap = z >= 17 ? 40 : z >= 16 ? 52 : z >= 15 ? 64 : 80;
  const cap = z >= 16.5 ? Infinity : z >= 15.5 ? 36 : z >= 14.5 ? 22 : 12;
  const { width, height } = map.getCanvas().getBoundingClientRect();
  let visible = 0;
  for (const [barId, entry] of list) {
    const p = map.project(entry.lngLat);
    const onScreen = p.x > -40 && p.y > -40 && p.x < width + 40 && p.y < height + 90;
    const clash = !must.has(barId) && ((onScreen && visible >= cap) || shown.some((q) => Math.abs(q.x - p.x) < gap && Math.abs(q.y - p.y) < gap + 8));
    entry.wrap.style.visibility = clash ? 'hidden' : '';
    if (!clash) { shown.push(p); if (onScreen) visible += 1; }
  }
}

function locate() {
  if (!navigator.geolocation) { toast(t('Este navegador no puede saber dónde estás.')); return; }
  toast(t('Buscando dónde estás…'), 6000);
  navigator.geolocation.getCurrentPosition((pos) => {
    state.me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    $('#toast').hidden = true;
    updateMap();
    flyTo(state.me.lon, state.me.lat, 16);
    render();
  }, () => toast(t('No se pudo saber dónde estás. Revisa el permiso de ubicación.')), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

/* ---------- Trocitos de las pantallas ---------- */
const svg = (body, size = 20, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;
const BACK_ICON = svg('<path d="M15 5l-7 7 7 7"></path>', 20);
const STAR_PATH = '<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"></path>';
const STAR = svg(STAR_PATH, 20);
const STAR_FILL = svg(STAR_PATH, 14, ' class="star-fill"');
const USER_PLUS = svg('<circle cx="10" cy="8" r="4"></circle><path d="M3 20c.8-3.6 3.6-5.6 7-5.6 1.5 0 2.9.4 4 1.1"></path><path d="M18 14v6M15 17h6"></path>', 20);
const BOOKMARK = svg('<path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"></path>', 20);
const SHARE = svg('<path d="M12 15V3M7 8l5-5 5 5"></path><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"></path>', 20);
const PIN_ICON = svg('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle>', 18);
const SHIELD = svg('<path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z"></path><path d="M9 12l2 2 4-4"></path>', 18);
const BUBBLE = svg('<path d="M4 5h16v11H10l-5 4v-4H4z"></path><path d="M12 8.5v3M12 13.8v.2"></path>', 18);
const CAMERA = svg('<path d="M4 8.5h3l1.8-2.5h6.4L17 8.5h3V19H4z"></path><circle cx="12" cy="13.2" r="3.4"></circle>', 20);
const IMAGE = svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"></rect><circle cx="9" cy="10" r="1.8"></circle><path d="M20.5 16l-5-5L6 19.5"></path>', 20);
const CHECK = svg('<path d="M5 12.5l4.2 4.2L19 7"></path>', 20);
const STORE = svg('<path d="M4 10v10h16V10"></path><path d="M3 10l2-6h14l2 6"></path><path d="M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"></path><path d="M10 20v-5h4v5"></path>', 20);
const GLASS = svg('<path d="M7 3h10l-1 7a4 4 0 0 1-8 0z"></path><path d="M12 14v7M8.5 21h7"></path>', 20);
const INFO = svg('<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5.5M12 7.6v.2"></path>', 18);
const LOCK = svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"></rect><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"></path>', 18);
const PHONE = svg('<rect x="7" y="2.8" width="10" height="18.4" rx="2.5"></rect><path d="M11 18h2"></path>', 18);
const CLOCK_ICON = svg('<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>', 18);
const MAP_ICON = svg('<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z"></path><path d="M9 4v14M15 6v14"></path>', 20);
const GLOBE = svg('<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9s1.3-6.3 3.8-9z"></path>', 18);
const TROPHY = svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"></path><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"></path>', 16);
const WALK = svg('<circle cx="13" cy="4.5" r="1.8"></circle><path d="M10.5 21l2-6.5-2.5-2.5 1-4.5 3 2.5 3 1"></path><path d="M11 8l-3 1.5-1 3.5M12.5 14.5l2.5 2.5 1 4"></path>', 20);
const NAV = svg('<path d="M12 3l7 18-7-4-7 4z"></path>', 20);
const fmtMedia = (m) => Number(m || 0).toFixed(1).replace('.', ',');
const rating = (x) => (x?.votos ? `<span class="votes">${STAR_FILL}${fmtMedia(x.media)}</span>` : '');
/** Mejor nota primero; a igual nota, la que tiene más; sin notas, al final. */
const byRating = (a, b) => (b.votos > 0) - (a.votos > 0) || b.media - a.media || b.votos - a.votos || b.at.localeCompare(a.at);
/** Se puede puntuar la tapa de hoy y la de anoche. */
const canRate = (tapa) => Boolean(state.fecha) && daysBetween(tapa.fecha, state.fecha) <= 1;

const back = () => `<button type="button" class="back" data-act="back" aria-label="${t('Volver')}" title="${t('Volver')}">${BACK_ICON}</button>`;
const privacyHref = () => (getLang() === 'gl' ? '/privacidade/' : '/privacidad/');
function foot({ bar = '', tapa = '' } = {}) {
  return `<footer class="end"><nav class="end-links" aria-label="${t('Más')}">
    <button type="button" data-act="report" data-bar="${esc(bar)}" data-tapa="${esc(tapa)}">${BUBBLE}${t('¿Algo no cuadra?')}</button>
    <a href="${privacyHref()}">${SHIELD}${t('Privacidad')}</a>
    ${getLang() === 'gl' ? `<button type="button" data-act="lang" data-lang="es" lang="es">${GLOBE}Castellano</button>` : `<button type="button" data-act="lang" data-lang="gl" lang="gl">${GLOBE}Galego</button>`}</nav>
    <p class="foot">${t('Web no oficial hecha en Lugo. Las tapas y sus fotos las suben los bares.')}</p></footer>`;
}
// Las tarjetas «¿Tienes un bar?» y «¿Es tu bar?», ocultas de momento. La página de alta sigue en /#alta.
const MOSTRAR_ALTA = false;
// Las tapas las suben los bares desde su panel; quien entra en la web solo las mira y las puntúa.
const SUBEN_CLIENTES = false;
const demoBanner = (show = DEMO) => {
  if (!DEMO && !show) return '';
  return `<p class="demo-line">${INFO}<span>${DEMO ? t('Modo de ejemplo: nada es real y no se envía nada.') : t('Tapas de ejemplo hasta que los bares suban las suyas.')}</span></p>`;
};
const tip = (icon, text) => `<li><span class="tip-icon">${icon}</span><span>${text}</span></li>`;
const nowCard = ({ act, to = '', bar = '', icon, label = '', title, sub = '', line = false }) => `<button type="button" class="now${line ? ' line' : ''}" data-act="${act}"${to !== '' ? ` data-to="${esc(to)}"` : ''}${bar ? ` data-bar="${esc(bar)}"` : ''}><span class="now-icon">${icon}</span><span class="now-text">${label ? `<span class="now-label">${label}</span>` : ''}<strong>${title}</strong>${sub ? `<small>${sub}</small>` : ''}</span><span class="now-go" aria-hidden="true">›</span></button>`;

/* ---------- Portada: historias, pestañas y el muro ---------- */
const AVATAR_COLORS = [['#FCE9E4', '#B5321A'], ['#FFF1C9', '#7A5800'], ['#E3F0D8', '#3E6B1F'], ['#E1ECF7', '#1F4E87'], ['#EDE5F6', '#5B3A8C'], ['#F6E3EC', '#8C2F5A']];
const SKIP_WORDS = new Set(['bar', 'cafe', 'café', 'cafeteria', 'cafetería', 'a', 'o', 'os', 'as', 'la', 'el', 'los', 'las', 'de', 'do', 'da', 'del', 'y', 'e']);
/** La foto de perfil de un bar: sus iniciales en un círculo de color (siempre el mismo para el bar). */
function avatar(bar, size = 40) {
  if (bar?.logo && /^[a-f0-9]{24}$/.test(bar.logo)) {
    return `<span class="avatar logo" style="--av:${size}px" aria-hidden="true"><img src="${API}/fotos/${bar.logo}${size > 120 ? '' : '-m'}.jpg" alt="" loading="lazy"></span>`;
  }
  const words = String(bar?.nombre ?? '?').split(/\s+/).filter(Boolean);
  const main = words.filter((w) => !SKIP_WORDS.has(w.toLowerCase()));
  const letters = ((main.length ? main : words).slice(0, 2).map((w) => [...w][0]).join('') || '?').toUpperCase();
  let h = 0;
  for (const c of String(bar?.id ?? '')) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const [bg, fg] = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return `<span class="avatar" style="--av:${size}px;background:${bg};color:${fg}" aria-hidden="true">${esc(letters)}</span>`;
}
const followers = (bar) => bar?.seguidores ?? 0;
const isFollowing = (id) => state.favs.includes(id);
const followBtn = (bar, big = false) => {
  const on = isFollowing(bar.id);
  return big
    ? `<button type="button" class="cta ${on ? 'second' : 'brand-btn'}" data-act="follow" data-bar="${esc(bar.id)}" aria-pressed="${on}">${on ? CHECK : USER_PLUS}${on ? t('Siguiendo') : t('Seguir')}</button>`
    : `<button type="button" class="follow${on ? ' on' : ''}" data-act="follow" data-bar="${esc(bar.id)}" aria-pressed="${on}">${on ? t('Siguiendo') : t('Seguir')}</button>`;
};

/** Una publicación del muro: el bar, la foto grande, las estrellas y el texto. */
function post(tapa) {
  const bar = state.barById.get(tapa.bar);
  if (!bar) return '';
  const when = isToday(tapa) ? ago(tapa) : `${shortDate(tapa.fecha)}`;
  return `<article class="post">
    <div class="post-head">
      <button type="button" class="who" data-act="open-bar" data-bar="${esc(bar.id)}">${avatar(bar)}<span><strong>${esc(bar.nombre)}</strong><small>${esc(when)}</small></span></button>
      ${followBtn(bar)}
    </div>
    <button type="button" class="post-photo" data-act="open-tapa" data-bar="${esc(bar.id)}" data-tapa="${esc(tapa.id)}" aria-label="${esc(tapa.nombre)} · ${esc(bar.nombre)}"><img src="${esc(src(tapa))}" alt="" loading="lazy" decoding="async">${tapa.autor === 'ejemplo' ? `<span class="tags"><span class="tag">${t('Ejemplo')}</span></span>` : ''}</button>
    <div class="post-line"><strong>${esc(tapa.nombre)}</strong>${tapa.votos ? `<span class="post-score">${STAR_FILL}${fmtMedia(tapa.media)}</span>` : ''}</div>
    ${tapa.nota ? `<p class="post-note">${esc(tapa.nota)}</p>` : ''}
  </article>`;
}

/** La tapa del día: la mejor valorada de hoy (con unas cuantas notas), a todo lo ancho. */
function heroHTML(today) {
  const best = today.filter((x) => x.votos >= 3).sort(byRating)[0];
  if (!best) return '';
  const bar = state.barById.get(best.bar);
  if (!bar) return '';
  return `<button type="button" class="hero" data-act="open-tapa" data-bar="${esc(bar.id)}" data-tapa="${esc(best.id)}">
    <img src="${esc(src(best))}" alt="" decoding="async">
    <span class="hero-badge">${TROPHY}${t('La tapa del día')}</span>
    <span class="hero-text"><strong>${esc(best.nombre)}</strong><small>${esc(bar.nombre)} · ${STAR_FILL}${fmtMedia(best.media)} · ${plural(best.votos, '1 nota', '{n} notas')}</small></span>
  </button>`;
}

/** Una lista de las mejores, con medallas: una tapa por bar y al menos 3 notas. */
function rankingHTML(title, list, max, empty) {
  const seen = new Set();
  const top = list.filter((x) => x.votos >= 3).sort(byRating).filter((x) => !seen.has(x.bar) && seen.add(x.bar)).slice(0, max);
  if (!top.length) return `<section class="top-week"><h2>${TROPHY}${title}</h2><p class="note">${empty}</p></section>`;
  return `<section class="top-week"><h2>${TROPHY}${title}</h2>${top.map((x, i) => {
    const bar = state.barById.get(x.bar);
    return `<button type="button" class="top-row" data-act="open-tapa" data-bar="${esc(x.bar)}" data-tapa="${esc(x.id)}"><span class="medal m${i + 1}">${i + 1}</span><img src="${esc(src(x, true))}" alt="" loading="lazy"><span class="to"><strong>${esc(x.nombre)}</strong><small>${esc(bar?.nombre ?? '')} · ${plural(x.votos, '1 nota', '{n} notas')}</small></span><span class="score">${STAR_FILL}${fmtMedia(x.media)}</span></button>`;
  }).join('')}</section>`;
}

function barRow(bar, extra = '') {
  const tapa = state.latest.get(bar.id);
  const sub = tapa ? `${isToday(tapa) ? t('Hoy') : esc(ago(tapa))}: ${esc(tapa.nombre)}` : (bar.dir ? esc(bar.dir) : t('Aún sin tapa hoy'));
  return `<button type="button" class="row" data-act="open-bar" data-bar="${esc(bar.id)}">${avatar(bar, 44)}<span class="to"><strong>${esc(bar.nombre)}</strong><small>${sub}${extra}</small></span><span class="more" aria-hidden="true">›</span></button>`;
}

/** En «Siguiendo», cada bar en una línea: su perfil y su tapa de hoy en pequeño. Al tocarlo, se abre. */
function followRow(bar) {
  const tapa = state.latest.get(bar.id);
  const today = tapa && isToday(tapa);
  const sub = tapa
    ? `${today ? `<b class="today">${t('Hoy')}</b>` : esc(shortDate(tapa.fecha))} · ${esc(tapa.nombre)}${tapa.votos ? ` · ${STAR_FILL}${fmtMedia(tapa.media)}` : ''}`
    : t('Aún no ha subido tapa');
  const fresh = today && !state.vistos.has(tapa.id);
  return `<button type="button" class="row follow-row" data-act="open-bar" data-bar="${esc(bar.id)}">${avatar(bar, 48)}<span class="to"><strong>${esc(bar.nombre)}</strong><small>${sub}</small></span>${tapa ? `<span class="pic${fresh ? ' fresh' : ''}"><img src="${esc(src(tapa, true))}" alt="" loading="lazy"></span>` : ''}</button>`;
}

function filtered(list) {
  if (TIPOS[state.filter]) return list.filter((x) => x.tipos?.includes(state.filter));
  return list;
}

const FEED_PAGE = 8;
function homeHTML() {
  const today = state.tapas.filter(isToday);
  const following = state.tab === 'siguiendo';
  const ranking = state.tab === 'top';
  // «Para ti»: las de hoy (o, si hoy aún no hay, las de estos días). «Siguiendo»: las de tus bares, de hoy y de estos días.
  const pool = today.length ? today : state.tapas;
  const list = filtered(pool);
  const counts = Object.fromEntries(Object.keys(TIPOS).map((k) => [k, pool.filter((x) => x.tipos?.includes(k)).length]));
  const chip = (key, label, n) => `<button type="button" data-act="filter" data-filter="${key}" aria-pressed="${state.filter === key}">${label}${n ? ` <span class="n">${n}</span>` : ''}</button>`;
  const filters = state.tab === 'todo' && pool.length > 1 ? `<div class="filters" role="group" aria-label="${t('Filtrar tapas')}">${chip('todas', t('Todas'), 0)}${Object.keys(TIPOS).filter((k) => counts[k]).map((k) => chip(k, tipoLabel(k), 0)).join('')}</div>` : '';

  const sub = `${esc(dayLabel(state.fecha))}${state.loaded && today.length ? ` · ${plural(today.length, '1 tapa', '{n} tapas')}` : ''}`;
  const title = `<div class="head home-head"><img src="icon.svg" width="40" height="40" alt="Que Tapa!"><div><h1>${t('Hoy en Lugo')}</h1><small>${sub}</small></div></div>`;

  const tab = (key, label) => `<button type="button" role="tab" data-act="tab" data-tab="${key}" aria-selected="${state.tab === key}">${label}</button>`;
  const tabs = `<div class="tabs" role="tablist">${tab('todo', t('Para ti'))}${tab('siguiendo', state.favs.length ? `${t('Siguiendo')} <span class="n">${state.favs.length}</span>` : t('Siguiendo'))}${tab('top', t('Top'))}</div>`;

  let feed;
  if (!state.loaded) feed = `<p class="empty">${t('Cargando las tapas de hoy…')}</p>`;
  else if (ranking) {
    // Las mejores de hoy y las de la semana, aparte del muro.
    feed = `${rankingHTML(t('Las mejores de hoy'), today, 5, t('Hoy aún no hay tapas con notas suficientes.'))}
      ${rankingHTML(t('Top de la semana en Lugo'), state.tapas.filter((x) => daysBetween(x.fecha, state.fecha) <= 6), 10, t('Esta semana aún no hay tapas con notas suficientes.'))}
      <p class="note">${t('Cuenta la nota media de cada tapa con al menos 3 notas; una por bar.')}</p>`;
  } else if (following) {
    // Solo el perfil de cada bar que sigues; al entrar ves todo lo suyo.
    const bars = state.favs.map((id) => state.barById.get(id)).filter(Boolean);
    const when = (b) => { const x = state.latest.get(b.id); return x ? `${isToday(x) ? 1 : 0}${x.fecha}${x.at}` : ''; };
    bars.sort((a, b) => when(b).localeCompare(when(a)));
    feed = bars.length
      ? `<section class="rows">${bars.map(followRow).join('')}</section>`
      : `<div class="feed-empty">${USER_PLUS}<strong>${t('Aún no sigues a ningún bar')}</strong><span>${t('Pulsa «Seguir» en los bares que te gusten y aquí los tendrás a mano, con su tapa de cada día.')}</span></div>`;
  } else if (!list.length) {
    feed = `<p class="empty">${pool.length ? t('Hoy no hay tapas de este tipo todavía.') : ''}</p>`;
  } else {
    const shown = list.slice(0, state.feedN);
    const olderNote = !today.length ? `<p class="note">${t('Hoy aún no hay tapas: estas son de los últimos días.')}</p>` : '';
    feed = `${olderNote}<div class="feed">${shown.map(post).join('')}</div>
      ${list.length > shown.length ? `<button type="button" class="cta second" data-act="more">${t('Ver más tapas')} <span class="n">${list.length - shown.length}</span></button>` : ''}`;
  }
  const upload = SUBEN_CLIENTES && state.loaded ? `<button type="button" class="cta brand-btn" data-act="upload">${CAMERA}${t('Subir una tapa')}</button>` : '';

  const near = state.me ? (() => {
    const bars = state.bares.map((b) => ({ b, d: distance(state.me, b) })).filter((x) => x.d < 1500).sort((a, b) => {
      const ta = state.latest.get(a.b.id);
      const tb = state.latest.get(b.b.id);
      return (tb && isToday(tb) ? 1 : 0) - (ta && isToday(ta) ? 1 : 0) || a.d - b.d;
    }).slice(0, 5);
    return bars.length ? `<section class="rows"><h2>${t('Cerca de ti')}</h2>${bars.map(({ b, d }) => barRow(b, ` · ${distanceText(d)}`)).join('')}</section>` : '';
  })() : '';

  const myBar = state.mine ? nowCard({ act: 'go', to: 'panel', icon: STORE, label: t('Tu bar'), title: esc(state.barById.get(state.mine.bar)?.nombre ?? state.mine.nombre ?? ''), sub: t('Sube la tapa de hoy y mira tus notas') }) : '';
  const promo = !MOSTRAR_ALTA || state.mine ? '' : nowCard({ act: 'go', to: 'alta', icon: STORE, title: t('¿Tienes un bar?'), sub: t('Pon tu tapa del día en el mapa. Gratis, sin apps ni cuentas.'), line: true });
  const offline = state.offline ? `<p class="notice-item">${INFO}<span>${t('Sin conexión: enseñamos lo último que se guardó en este móvil.')}</span></p>` : '';

  return `${title}${demoBanner(state.tapas.some((x) => x.autor === 'ejemplo'))}${offline}${myBar}${heroHTML(today)}${tabs}${filters}${feed}${upload}${near}${promo}${foot()}`;
}

/* ---------- Ficha del bar ---------- */
function barHTML() {
  const bar = state.barById.get(state.barId) ?? state.bar?.bar;
  if (!bar) return `<div class="head">${back()}<div><h1>${state.loaded ? t('Este bar ya no está en el mapa') : t('Cargando…')}</h1></div></div>`;
  const history = (state.bar?.bar?.id === bar.id ? state.bar.tapas : state.tapas.filter((x) => x.bar === bar.id)).slice().sort((a, b) => b.at.localeCompare(a.at));
  const tapa = history.find((x) => x.id === state.tapaId) ?? history[0] ?? null;
  const owner = state.mine?.bar === bar.id;

  const kind = { bar: t('Bar'), pub: t('Pub'), cafe: t('Cafetería'), restaurant: t('Restaurante') }[bar.tipo] ?? t('Bar');
  const headHTML = `<div class="head">${back()}<div><h1>${esc(bar.nombre)}</h1><small>${bar.reg ? `${t('El bar sube sus tapas')} · Lugo` : `${esc(kind)} · Lugo`}</small></div>
    <button type="button" class="icon-btn" data-act="share" aria-label="${t('Compartir')}" title="${t('Compartir')}">${SHARE}</button></div>`;
  // El perfil, como en una red social: la foto, cuántas tapas, la media y los seguidores.
  const stat = (b, label) => `<div><b>${b}</b><small>${label}</small></div>`;
  const profile = `<div class="profile">${avatar(bar, 76)}<div class="profile-stats">
      ${stat(history.length, history.length === 1 ? t('tapa') : t('tapas'))}
      ${stat(bar.votos ? `${STAR_FILL}${fmtMedia(bar.media)}` : '–', bar.votos ? plural(bar.votos, '1 nota', '{n} notas') : t('sin notas'))}
      ${stat(followers(bar), followers(bar) === 1 ? t('seguidor') : t('seguidores'))}
    </div></div>`;

  let body;
  if (tapa) {
    const mine = state.notas[tapa.id]?.nota ?? 0;
    const tags = tapa.autor === 'ejemplo' ? `<span class="tag">${t('Ejemplo')}</span>`
      : isToday(tapa) ? `<span class="tag today">${t('Hoy')} · ${esc(ago(tapa))}</span>` : `<span class="tag">${CLOCK_ICON}${esc(ago(tapa))}</span>`;
    const tipos = (tapa.tipos ?? []).filter((k) => TIPOS[k]).map(tipoLabel).join(' · ');
    body = `<div class="photo"><img src="${esc(src(tapa))}" alt="${esc(tapa.nombre)}"><div class="tags">${tags}</div></div>
      <div class="tapa-meta"><h2 class="big-line">${esc(tapa.nombre)}</h2>${tipos ? `<small>${esc(tipos)}</small>` : ''}</div>
      ${tapa.nota ? `<p class="nota">${esc(tapa.nota)}</p>` : ''}
      ${canRate(tapa) ? `<div class="rate">
          <div class="rate-head"><strong>${mine ? t('Tu nota') : t('¿Qué te pareció?')}</strong><small>${tapa.votos ? `${STAR_FILL}${fmtMedia(tapa.media)} ${t('de media')} · ${plural(tapa.votos, '1 nota', '{n} notas')}` : t('Sé el primero en puntuarla')}</small></div>
          <div class="stars" role="group" aria-label="${t('Tu nota')}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${n <= mine ? 'on' : ''}" data-act="rate" data-tapa="${esc(tapa.id)}" data-nota="${n}" aria-pressed="${n === mine}" aria-label="${plural(n, '1 estrella', '{n} estrellas')}">${STAR}</button>`).join('')}</div>
</div>`
        : `${tapa.votos ? `<p class="note">${STAR_FILL} ${fmtMedia(tapa.media)} ${t('de media')} · ${plural(tapa.votos, '1 nota', '{n} notas')}</p>` : ''}<p class="note">${t('Esta es la última que subió. Cuando suba la de hoy, saldrá aquí.')}</p>`}`;
  } else {
    body = `<div class="photo none"><div>${CLOCK_ICON}<strong>${t('Este bar aún no ha subido su tapa')}</strong><span>${t('Cuando la suba, saldrá aquí con su foto.')}</span></div></div>`;
  }

  const canUpload = owner || SUBEN_CLIENTES;
  const actions = `<div class="buttons">
    ${canUpload ? `<button type="button" class="cta ${tapa && isToday(tapa) ? 'second' : 'brand-btn'}" data-act="upload" data-bar="${esc(bar.id)}">${CAMERA}${owner ? t('Subir la tapa de hoy') : t('Subir la de hoy')}</button>` : followBtn(bar, true)}
    <button type="button" class="cta second" data-act="go" data-to="ruta/${esc(bar.id)}">${WALK}${t('Cómo llegar')}</button></div>
    ${bar.dir || bar.insta ? `<p class="addr">${PIN_ICON}<span>${esc(bar.dir || '')}${state.me ? ` · ${distanceText(distance(state.me, bar))}` : ''}${bar.insta ? `${bar.dir ? ' · ' : ''}<a href="https://instagram.com/${esc(bar.insta)}" target="_blank" rel="noopener">@${esc(bar.insta)}</a>` : ''}</span></p>` : ''}`;

  const grid = history.length > 1 ? `<section class="section"><h2>${t('Sus tapas')}</h2>
    <div class="grid">${history.slice(0, 24).map((x) => `<button type="button" data-act="pick-tapa" data-tapa="${esc(x.id)}" aria-current="${x.id === tapa?.id}" aria-label="${esc(x.nombre)} · ${esc(isToday(x) ? t('Hoy') : shortDate(x.fecha))}"><img src="${esc(src(x, true))}" alt="" loading="lazy"></button>`).join('')}</div></section>` : '';

  const claim = MOSTRAR_ALTA && !bar.reg && !owner ? nowCard({ act: 'go', to: `alta/${bar.id}`, icon: STORE, title: t('¿Es tu bar?'), sub: t('Sube tú la tapa cada día y sal destacado en el mapa. Gratis.'), line: true }) : '';

  return `${headHTML}${profile}${actions}${demoBanner(tapa?.autor === 'ejemplo')}${body}${grid}${claim}${foot({ bar: bar.id, tapa: tapa?.id ?? '' })}`;
}
const shortDate = (fecha) => { const d = new Date(`${fecha}T12:00:00Z`); return `${d.getUTCDate()} ${MESES[getLang()][d.getUTCMonth()].slice(0, 3)}`; };

/* ---------- Buscar ---------- */
function searchHTML() {
  const q = norm(state.query.trim());
  const head = `<div class="head"><button type="button" class="back" data-act="search-close" aria-label="${t('Cerrar la búsqueda')}" title="${t('Cerrar la búsqueda')}">${BACK_ICON}</button><div><h1>${t('Buscar')}</h1></div></div>`;
  return head + searchResults(q);
}
function searchResults(q) {
  if (!q) {
    const favBars = state.favs.map((id) => state.barById.get(id)).filter(Boolean);
    const withTapa = state.bares.filter((b) => state.latest.has(b.id) && isToday(state.latest.get(b.id))).slice(0, 12);
    return `${favBars.length ? `<section class="rows"><h2>${t('Siguiendo')}</h2>${favBars.map((b) => barRow(b)).join('')}</section>` : ''}
      ${withTapa.length ? `<section class="rows"><h2>${t('Con tapa hoy')}</h2>${withTapa.map((b) => barRow(b)).join('')}</section>` : `<p class="empty">${t('Escribe el nombre de un bar o de una tapa: raxo, callos, tortilla…')}</p>`}`;
  }
  const words = q.split(/\s+/);
  const match = (s) => { const n = norm(s); return words.every((w) => n.includes(w)); };
  const tapas = state.tapas.filter((x) => match(x.nombre)).sort((a, b) => (isToday(b) - isToday(a)) || byRating(a, b)).slice(0, 12);
  const bars = state.bares.filter((b) => match(`${b.nombre} ${b.dir}`)).sort((a, b) => (state.latest.has(b.id) - state.latest.has(a.id)) || a.nombre.localeCompare(b.nombre)).slice(0, 25);
  if (!tapas.length && !bars.length) return `<p class="empty">${t('No encontramos nada con «{q}».', { q: esc(state.query.trim()) })}</p>`;
  return `${tapas.length ? `<section class="rows"><h2>${t('Tapas')}</h2>${tapas.map((x) => `<button type="button" class="row" data-act="open-tapa" data-bar="${esc(x.bar)}" data-tapa="${esc(x.id)}"><img class="thumb" src="${esc(src(x, true))}" alt="" loading="lazy"><span class="to"><strong>${esc(x.nombre)}</strong><small>${esc(state.barById.get(x.bar)?.nombre ?? '')} · ${esc(ago(x))}</small></span>${x.votos ? `<span class="score">${STAR_FILL}${fmtMedia(x.media)}</span>` : ''}</button>`).join('')}</section>` : ''}
    ${bars.length ? `<section class="rows"><h2>${t('Bares')}</h2>${bars.map((b) => barRow(b)).join('')}</section>` : ''}`;
}

/* ---------- Subir una tapa ---------- */
function uploadHTML() {
  const up = state.upload;
  const bar = up.bar ? state.barById.get(up.bar) : null;
  const owner = Boolean(bar && state.mine?.bar === bar.id);
  const head = `<div class="head">${back()}<div><h1>${owner ? t('La tapa de hoy') : t('Sube una tapa')}</h1><small>${owner ? t('Sale en el mapa al momento') : t('La foto de lo que te pusieron con la consumición')}</small></div></div>`;

  if (up.done) {
    return `${head}<div class="ride-hero"><span class="ok-icon">${CHECK}</span><strong class="big-line">${owner ? t('¡Ya está en el mapa!') : t('¡Gracias!')}</strong>
      <small>${owner ? t('Comparte el enlace de tu bar en tus redes para que la vean.') : t('La miramos en un momento y sale en el mapa. Así nadie sube cosas raras.')}</small></div>
      <div class="buttons">${owner ? `<button type="button" class="cta brand-btn" data-act="share-bar" data-bar="${esc(bar.id)}">${SHARE}${t('Compartir mi bar')}</button>` : ''}
      <button type="button" class="cta second" data-act="go" data-to="${owner ? 'panel' : ''}">${owner ? t('Volver a tu bar') : t('Volver al mapa')}</button></div>`;
  }

  if (!bar) {
    const q = norm(up.q ?? '');
    let list = state.bares;
    if (q) list = list.filter((b) => norm(`${b.nombre} ${b.dir}`).includes(q));
    if (state.me) list = [...list].sort((a, b) => distance(state.me, a) - distance(state.me, b));
    else if (!q) list = [...list].sort((a, b) => (state.latest.has(b.id) - state.latest.has(a.id)) || a.nombre.localeCompare(b.nombre));
    list = list.slice(0, 20);
    return `${head}<div class="form">
      ${state.me ? '' : `<button type="button" class="cta second" data-act="locate">${PIN_ICON}${t('Buscar los bares de aquí al lado')}</button>`}
      <label class="field"><span>${t('¿En qué bar estás?')}</span><input id="up-q" type="search" value="${esc(up.q ?? '')}" placeholder="${t('Nombre del bar')}" autocomplete="off"></label>
      <div class="rows">${list.map((b) => `<button type="button" class="row" data-act="up-bar" data-bar="${esc(b.id)}"><span class="thumb">${GLASS}</span><span class="to"><strong>${esc(b.nombre)}</strong><small>${esc(b.dir || '')}${state.me ? `${b.dir ? ' · ' : ''}${distanceText(distance(state.me, b))}` : ''}</small></span><span class="more" aria-hidden="true">›</span></button>`).join('') || `<p class="empty">${t('No aparece. Si es tu bar, puedes darlo de alta.')}</p>`}</div>
      <button type="button" class="ghost" data-act="go" data-to="alta">${t('Mi bar no está en la lista')}</button></div>`;
  }

  const picked = `<div class="now picked"><span class="now-icon">${PIN_ICON}</span><span class="now-text"><strong>${esc(bar.nombre)}</strong><small>${esc(bar.dir || t('Lugo'))}</small></span>${owner ? '' : `<button type="button" class="ghost" data-act="up-change">${t('Cambiar')}</button>`}</div>`;
  const photo = up.photo
    ? `<div class="preview"><img src="${esc(up.photo.url)}" alt=""><button type="button" data-act="pick-gallery">${t('Cambiar la foto')}</button></div>`
    : `<div class="picker"><button type="button" class="main" data-act="pick-camera">${CAMERA}${t('Hacer la foto')}</button><button type="button" data-act="pick-gallery">${IMAGE}${t('Elegir de la galería')}</button></div>
      ${up.processing ? `<p class="note">${t('Preparando la foto…')}</p>` : ''}`;
  const tipos = Object.keys(TIPOS).map((k) => `<button type="button" data-act="up-tipo" data-tipo="${k}" aria-pressed="${up.tipos.includes(k)}">${tipoLabel(k)}</button>`).join('');
  const ready = up.photo && up.nombre.trim().length >= 2 && !up.sending;
  return `${head}${demoBanner()}<div class="form">${picked}${photo}
    <label class="field"><span>${t('¿Qué tapa es?')}</span><input id="up-nombre" value="${esc(up.nombre)}" maxlength="60" placeholder="${t('Raxo con patatas, callos, tortilla…')}" autocomplete="off" enterkeyhint="done"></label>
    <div class="chips small">${IDEAS.map((x) => `<button type="button" data-act="up-idea" data-idea="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="field"><span>${t('¿De qué es?')} <small>${t('(si quieres)')}</small></span><div class="chips">${tipos}</div></div>
    ${owner ? `<label class="field"><span>${t('Una nota')} <small>${t('(si quieres)')}</small></span><input id="up-nota" value="${esc(up.nota)}" maxlength="80" placeholder="${t('Hasta las 15:00 · Solo con vino')}" autocomplete="off"><small>${t('Sale debajo de la foto.')}</small></label>` : ''}
    <label class="trap" aria-hidden="true">Web <input id="up-web" tabindex="-1" autocomplete="off"></label>
    <button type="button" class="cta brand-btn" data-act="up-send" ${ready ? '' : 'disabled'}>${up.sending ? t('Subiendo…') : owner ? t('Publicar ya') : t('Enviar')}</button>
    <p class="foot">${owner ? t('Solo tú tienes este enlace: lo que subas sale con la marca «Foto del bar».') : t('Antes de salir la revisamos. No necesitas cuenta y no guardamos quién eres; la foto se envía sin la ubicación ni los datos del móvil.')}</p></div>`;
}

/* ---------- Alta de un bar ---------- */
function altaHTML() {
  const a = state.alta;
  const head = `<div class="head">${back()}<div><h1>${t('Pon tu bar en el mapa')}</h1><small>${t('Gratis, sin apps ni cuentas')}</small></div></div>`;
  if (a.sent) {
    return `${head}<div class="ride-hero"><span class="ok-icon">${CHECK}</span><strong class="big-line">${t('¡Recibido!')}</strong><small>${t('Te mandamos el enlace privado de tu bar en cuanto lo revisemos, normalmente el mismo día.')}</small></div>
      <button type="button" class="cta second" data-act="go" data-to="">${t('Volver al mapa')}</button>`;
  }
  if (a.aiming) {
    return `<div class="head"><div><h1>${t('¿Dónde está tu bar?')}</h1><small>${t('Mueve el mapa hasta que la chincheta quede encima.')}</small></div></div>
      <div class="buttons"><button type="button" class="cta brand-btn" data-act="aim-ok">${t('Es aquí')}</button><button type="button" class="cta second" data-act="aim-cancel">${t('Cancelar')}</button></div>`;
  }
  const located = Number.isFinite(a.lat);
  const where = a.osm
    ? `<div class="now"><span class="now-icon">${PIN_ICON}</span><span class="now-text"><strong>${esc(a.nombre)}</strong><small>${t('Ya está en el mapa: usamos su sitio.')}</small></span></div>`
    : `<div class="field"><span>${t('¿Dónde está?')}</span>${located ? `<div class="now picked"><span class="now-icon">${CHECK}</span><span class="now-text"><strong>${t('Sitio marcado')}</strong><small>${a.lat.toFixed(5)}, ${a.lon.toFixed(5)}</small></span><button type="button" class="ghost" data-act="aim">${t('Cambiar')}</button></div>`
      : `<div class="buttons"><button type="button" class="cta second" data-act="alta-here">${PIN_ICON}${t('Estoy en el bar')}</button><button type="button" class="cta second" data-act="aim">${MAP_ICON}${t('Lo marco en el mapa')}</button></div>`}</div>`;
  const ready = a.nombre.trim().length >= 2 && a.contacto.trim().length >= 5 && located && !a.sending;
  return `${head}${demoBanner()}<ul class="tips">
      ${tip(CAMERA, t('Subes tu tapa del día en 20 segundos desde el móvil del bar.'))}
      ${tip(STAR, t('La gente la puntúa y las mejor valoradas salen arriba.'))}
      ${tip(CHECK, t('Tus fotos llevan la marca «Foto del bar».'))}</ul>
    <div class="form">
    ${a.osm ? where : `<label class="field"><span>${t('Nombre del bar')}</span><input id="al-nombre" value="${esc(a.nombre)}" maxlength="60" autocomplete="organization"></label>
      <label class="field"><span>${t('Dirección')}</span><input id="al-dir" value="${esc(a.dir)}" maxlength="100" placeholder="${t('Rúa Nova, 12')}" autocomplete="street-address"></label>${where}`}
    <label class="field"><span>${t('Teléfono o email')}</span><input id="al-contacto" value="${esc(a.contacto)}" maxlength="120" inputmode="email" autocomplete="tel"><small>${t('Solo para mandarte el enlace de tu bar. No sale en ningún sitio.')}</small></label>
    <label class="field"><span>${t('Instagram del bar')} <small>${t('(si quieres)')}</small></span><input id="al-insta" value="${esc(a.insta)}" maxlength="40" placeholder="@tubar" autocomplete="off"></label>
    <label class="field"><span>${t('¿Algo más?')} <small>${t('(si quieres)')}</small></span><textarea id="al-mensaje" maxlength="400" rows="3">${esc(a.mensaje)}</textarea></label>
    <label class="trap" aria-hidden="true">Web <input id="al-web" tabindex="-1" autocomplete="off"></label>
    <button type="button" class="cta brand-btn" data-act="alta-send" ${ready ? '' : 'disabled'}>${a.sending ? t('Enviando…') : t('Quiero mi enlace')}</button></div>
    ${foot()}`;
}

/* ---------- Panel del bar ---------- */
function panelHTML() {
  const head = (title, sub) => `<div class="head">${back()}<div><h1>${title}</h1>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  if (!state.mine) return `${head(t('Tu bar'))}<p class="empty">${t('Abre el enlace privado que te mandamos para entrar en el panel de tu bar.')}</p><button type="button" class="cta brand-btn" data-act="go" data-to="alta">${t('Pedir mi enlace')}</button>`;
  const p = state.panel;
  if (!p) return `${head(t('Tu bar'))}<p class="empty">${t('Cargando…')}</p>`;
  if (p.error) {
    return `${head(t('Tu bar'))}<div class="ride-hero"><strong class="big-line">${t('Este enlace ya no vale')}</strong><small>${esc(p.error)}. ${t('Pídenos uno nuevo y te lo mandamos.')}</small></div>
      <button type="button" class="cta second" data-act="logout">${t('Olvidar este enlace en el móvil')}</button>`;
  }
  const today = p.tapas.filter((x) => x.fecha === p.fecha);
  const install = state.installPrompt ? `<button type="button" class="cta second" data-act="install">${PHONE}${t('Añadir a la pantalla de inicio')}</button>`
    : tip(PHONE, /iP(hone|ad|od)/.test(navigator.userAgent) ? t('Guárdalo en la pantalla de inicio: botón Compartir › «Añadir a pantalla de inicio».') : t('Guárdalo en la pantalla de inicio desde el menú del navegador.'));
  const logoBox = `<div class="logo-box">${avatar(p.bar, 64)}<div><strong>${t('Logo del bar')}</strong><small>${p.bar.logo ? t('Sale en tu perfil y en el muro.') : t('Sube tu logo o una foto de la fachada: sale en tu perfil y en el muro.')}</small>
      <div class="logo-actions"><button type="button" class="ghost" data-act="pick-logo"${state.logoBusy ? ' disabled' : ''}>${state.logoBusy ? t('Subiendo…') : p.bar.logo ? t('Cambiar') : t('Subir logo')}</button>${p.bar.logo && !state.logoBusy ? `<button type="button" class="ghost" data-act="del-logo">${t('Quitar')}</button>` : ''}</div></div></div>`;
  return `${head(esc(p.bar.nombre), t('Panel de tu bar'))}
    ${logoBox}
    <button type="button" class="cta brand-btn" data-act="upload" data-bar="${esc(p.bar.id)}">${CAMERA}${today.length ? t('Subir otra tapa') : t('Subir la tapa de hoy')}</button>
    <div class="stats"><div class="stat hot"><b>${p.total.votos ? fmtMedia(p.total.media) : '–'}</b><small>${p.total.votos ? `${t('de media')} · ${plural(p.total.votos, '1 nota', '{n} notas')}` : t('aún sin notas')}</small></div><div class="stat"><b>${p.total.tapas}</b><small>${t('tapas subidas')}</small></div><div class="stat"><b>${p.bar?.seguidores ?? 0}</b><small>${(p.bar?.seguidores ?? 0) === 1 ? t('seguidor') : t('seguidores')}</small></div></div>
    ${today.length ? `<section class="section"><h2>${t('Hoy')}</h2>${today.map((x) => `<div class="mine"><img src="${esc(src(x, true))}" alt=""><div><strong>${esc(x.nombre)}</strong><small>${esc(ago(x))} · ${x.votos ? `${fmtMedia(x.media)} ${t('de media')} (${x.votos})` : t('aún sin notas')}</small></div>
      ${x.autor === 'bar' ? `<button type="button" class="ghost" data-act="del-tapa" data-tapa="${esc(x.id)}">${state.confirmDelete === x.id ? t('¿Seguro? Borrar') : t('Borrar')}</button>` : ''}</div>`).join('')}</section>` : `<p class="empty">${t('Hoy todavía no subiste ninguna. Las primeras del día salen arriba del todo.')}</p>`}
    <section class="section"><h2>${t('Que te encuentren')}</h2>
      <button type="button" class="cta second" data-act="share-bar" data-bar="${esc(p.bar.id)}">${SHARE}${t('Compartir el enlace de tu bar')}</button></section>
    <ul class="tips">${tip(INFO, t('Ponlo en tu Instagram o en un cartel con QR en la barra: «Mira aquí nuestra tapa de hoy».'))}${state.installPrompt ? '' : install}${tip(LOCK, t('Este panel es solo para tu bar: no compartas el enlace privado.'))}</ul>
    ${state.installPrompt ? install : ''}
    <button type="button" class="ghost" data-act="logout">${t('Salir del panel en este móvil')}</button>${foot({ bar: p.bar.id })}`;
}

/* ---------- Cómo llegar ---------- */
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const metresText = (m) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
const minutesFor = (m) => Math.max(1, Math.round(m / 75));
function externalNav(bar) {
  const google = `https://www.google.com/maps/dir/?api=1&amp;destination=${bar.lat},${bar.lon}&amp;travelmode=walking`;
  const apple = `https://maps.apple.com/?daddr=${bar.lat},${bar.lon}&amp;dirflg=w`;
  return `<section class="section"><h2>${t('Con tu app de mapas, que te va diciendo por dónde ir')}</h2><div class="buttons">
    ${isIOS() ? `<a class="cta second" href="${apple}" target="_blank" rel="noopener">${t('Mapas de Apple')}</a>` : ''}
    <a class="cta second" href="${google}" target="_blank" rel="noopener">Google Maps</a></div></section>`;
}
function routeHTML() {
  const n = state.nav;
  const bar = state.barById.get(n?.bar);
  const head = `<div class="head">${back()}<div><h1>${t('Cómo llegar')}</h1><small>${esc(bar?.nombre ?? '')}</small></div></div>`;
  if (!bar) return `${head}<p class="empty">${state.loaded ? t('Este bar ya no está en el mapa') : t('Cargando…')}</p>`;
  if (n.arrived) {
    return `${head}<div class="ride-hero"><span class="ok-icon">${CHECK}</span><strong class="big-line">${t('¡Has llegado!')}</strong><small>${t('Que aproveche.')}</small></div>
      <button type="button" class="cta brand-btn" data-act="go" data-to="bar/${esc(bar.id)}">${t('Ver la tapa')}</button>`;
  }
  if (n.status === 'locating') return `${head}<p class="empty">${t('Buscando dónde estás…')}</p>`;
  if (n.status === 'nogps') {
    return `${head}<div class="ride-hero"><strong class="big-line">${t('No sabemos dónde estás')}</strong><small>${t('Da permiso de ubicación al navegador para ver la ruta en el mapa.')}</small></div>
      <button type="button" class="cta" data-act="nav-retry">${PIN_ICON}${t('Probar otra vez')}</button>${externalNav(bar)}`;
  }
  if (n.status === 'far') {
    return `${head}<div class="ride-hero"><strong class="big-line">${t('Estás lejos de este bar')}</strong><small>${t('La ruta a pie solo sale por las calles de Lugo. Desde ahí, mejor con tu app de mapas.')}</small></div>${externalNav(bar)}`;
  }
  if (n.following) {
    return `${head}<div class="ride-hero"><span class="now-label">${t('A pie')}</span><strong class="big-line">${t('Quedan {n} min', { n: minutesFor(n.left) })}</strong><small>${metresText(n.left)} · ${t('El mapa te sigue y la pantalla no se apaga.')}</small></div>
      <button type="button" class="cta" data-act="nav-stop">${t('Terminar')}</button>`;
  }
  return `${head}<div class="ride-hero"><span class="now-label">${t('A pie')}</span><strong class="big-line">${t('{n} min', { n: minutesFor(n.metros) })}</strong><small>${metresText(n.metros)} · ${t('por las calles de Lugo')}</small></div>
    <button type="button" class="cta brand-btn" data-act="nav-start">${NAV}${t('Empezar')}</button>
    ${externalNav(bar)}`;
}

/* ---------- Ruta de tapas ---------- */
const PRAZA_MAIOR = { lat: 43.00963, lon: -7.55663 };
const TOUR_ICON = svg('<circle cx="6" cy="18" r="2.4"></circle><circle cx="18" cy="6" r="2.4"></circle><path d="M8.2 17.2c3-1 2.2-4.2 5.3-5.4 2.6-1 2.8-2.6 2.9-3.9"></path>', 22);
let tourMarkers = [];

/** Elige 3 o 4 bares con tapa hoy, buenos y cerca unos de otros, empezando por el más próximo. */
function pickTour(start, seed = 0) {
  const jitter = (id) => { let h = seed * 7919; for (const c of id) h = (h * 31 + c.codePointAt(0)) >>> 0; return (h % 1000) / 1000; };
  const quality = (bar, tapa) => (tapa.votos ? tapa.media : 3.6) + (isFollowing(bar.id) ? 0.4 : 0) + (seed ? jitter(bar.id) * 0.8 : 0);
  const pool = [...state.latest.values()].filter(isToday).map((tapa) => ({ tapa, bar: state.barById.get(tapa.bar) })).filter((x) => x.bar && distance(start, x.bar) < 1500);
  const stops = [];
  let here = start;
  while (stops.length < 4) {
    let best = null;
    for (const x of pool) {
      if (stops.some((s) => s.bar.id === x.bar.id)) continue;
      const d = distance(here, x.bar);
      if (d > (stops.length ? 700 : 1200) || (stops.length && d < 40)) continue;
      const score = quality(x.bar, x.tapa) - d / 300;
      if (!best || score > best.score) best = { ...x, score };
    }
    if (!best) break;
    stops.push(best);
    here = best.bar;
  }
  return stops.length >= 2 ? stops : [];
}

async function startTour(seed = 0) {
  const tour = { status: 'locating', seed };
  state.tour = tour;
  render();
  let start = null;
  let startName = '';
  try { start = await currentPosition(); } catch { /* sin GPS: desde la Praza Maior */ }
  if (state.tour !== tour) return;
  if (start) state.me = start;
  if (!start || distance(start, PRAZA_MAIOR) > 3000) { start = PRAZA_MAIOR; startName = t('Praza Maior'); }
  const stops = pickTour(start, seed);
  if (!stops.length) { tour.status = 'none'; render(); return; }
  let coords = [];
  let metros = 0;
  let tools = null;
  try { tools = await loadNavTools(); } catch { /* sin callejero: líneas rectas */ }
  if (state.tour !== tour) return;
  let from = start;
  for (const stop of stops) {
    const leg = tools?.mod.walkRoute(tools.g, [from.lon, from.lat], [stop.bar.lon, stop.bar.lat]);
    const legCoords = leg?.coords ?? [[from.lon, from.lat], [stop.bar.lon, stop.bar.lat]];
    stop.metros = leg?.metros ?? Math.round(distance(from, stop.bar) * 1.3);
    metros += stop.metros;
    coords = coords.concat(coords.length ? legCoords.slice(1) : legCoords);
    from = stop.bar;
  }
  Object.assign(tour, { status: 'ok', start, startName, stops, coords, metros });
  drawRoute(coords);
  drawTourMarkers(stops);
  scheduleDeclutter();
  render();
  requestAnimationFrame(() => fitRoute(coords));
}

function drawTourMarkers(stops) {
  for (const m of tourMarkers) m.remove();
  tourMarkers = [];
  if (!mapReady) return;
  stops.forEach((stop, i) => {
    const el = document.createElement('div');
    el.className = 'tour-num';
    el.textContent = String(i + 1);
    tourMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([stop.bar.lon, stop.bar.lat]).addTo(map));
  });
}

function closeTour() {
  state.tour = null;
  for (const m of tourMarkers) m.remove();
  tourMarkers = [];
  if (!state.nav) drawRoute(null);
}

function tourHTML() {
  const tour = state.tour;
  const head = (sub = '') => `<div class="head">${back()}<div><h1>${t('Ruta de tapas')}</h1><small>${sub}</small></div></div>`;
  if (!tour || tour.status === 'locating') return `${head(t('Buscando bares cerca…'))}<p class="empty">${t('Buscando dónde estás…')}</p>`;
  if (tour.status === 'none') {
    return `${head()}<div class="ride-hero"><strong class="big-line">${t('Hoy no hay tapas suficientes cerca')}</strong><small>${t('Cuando más bares suban la suya, aquí te haremos la ruta.')}</small></div><button type="button" class="cta" data-act="back">${t('Volver')}</button>`;
  }
  const mins = minutesFor(tour.metros);
  const sub = `${plural(tour.stops.length, '1 bar', '{n} bares')} · ${metresText(tour.metros)} · ${t('{n} min andando', { n: mins })}`;
  const stops = tour.stops.map((s, i) => `<button type="button" class="tour-stop" data-act="open-tapa" data-bar="${esc(s.bar.id)}" data-tapa="${esc(s.tapa.id)}">
      <span class="tour-n">${i + 1}</span><img src="${esc(src(s.tapa, true))}" alt="" loading="lazy">
      <span class="to"><strong>${esc(s.tapa.nombre)}</strong><small>${esc(s.bar.nombre)}${s.tapa.votos ? ` · ${STAR_FILL}${fmtMedia(s.tapa.media)}` : ''}</small><small class="leg">${WALK}${i === 0 ? (tour.startName ? t('{n} min desde la {sitio}', { n: minutesFor(s.metros), sitio: tour.startName }) : t('{n} min desde donde estás', { n: minutesFor(s.metros) })) : t('{n} min desde la anterior', { n: minutesFor(s.metros) })}</small></span></button>`).join('');
  return `${head(sub)}<div class="tour-list">${stops}</div>
    <div class="buttons"><button type="button" class="cta brand-btn" data-act="go" data-to="ruta/${esc(tour.stops[0].bar.id)}">${NAV}${t('Ir a la primera')}</button>
    <button type="button" class="cta second" data-act="tour-again">${TOUR_ICON}${t('Otra ruta')}</button></div>
    <p class="note">${t('Elegimos bares con tapa hoy, bien valorados y cerca unos de otros. Cuando acabes en uno, abre el siguiente y dale a «Cómo llegar».')}</p>`;
}

/* ---------- ¿Algo no cuadra? ---------- */
const REPORT_KINDS = {
  foto: 'La foto no es de una tapa o no es de este bar',
  cerrado: 'El bar está cerrado o ya no existe',
  sitio: 'El bar está mal colocado en el mapa',
  otro: 'Otra cosa',
};
function reportHTML() {
  const r = state.report;
  const bar = r.bar ? state.barById.get(r.bar) : null;
  const head = `<div class="head">${back()}<div><h1>${t('¿Algo no cuadra?')}</h1><small>${bar ? esc(bar.nombre) : t('Cuéntanoslo y lo arreglamos')}</small></div></div>`;
  if (r.sent) return `${head}<div class="ride-hero"><span class="ok-icon">${CHECK}</span><strong class="big-line">${t('¡Gracias!')}</strong><small>${t('Lo miramos lo antes posible.')}</small></div><button type="button" class="cta" data-act="back">${t('Volver')}</button>`;
  const kinds = Object.entries(REPORT_KINDS).filter(([k]) => bar || k === 'otro').map(([k, label]) => `<label class="chip"><input type="radio" name="rep-tipo" value="${k}" ${r.tipo === k ? 'checked' : ''}><span>${t(label)}</span></label>`).join('');
  return `${head}<div class="form"><div class="chips">${kinds}</div>
    <label class="field"><span>${t('Cuéntanos')} <small>${t('(si quieres)')}</small></span><textarea id="rep-texto" maxlength="1000" rows="3">${esc(r.texto)}</textarea></label>
    <label class="field"><span>${t('Tu contacto, si quieres respuesta')} <small>${t('(si quieres)')}</small></span><input id="rep-contacto" value="${esc(r.contacto)}" maxlength="120" autocomplete="email"></label>
    <label class="trap" aria-hidden="true">Web <input id="rep-web" tabindex="-1" autocomplete="off"></label>
    <button type="button" class="cta" data-act="rep-send" ${r.sending ? 'disabled' : ''}>${r.sending ? t('Enviando…') : t('Enviar')}</button>
    <p class="foot">${t('No guardamos tu IP ni nada del móvil: solo lo que escribes.')}</p></div>`;
}

/* ---------- Pintar ---------- */
const TALL = ['search', 'upload', 'alta', 'panel', 'report'];
function render() {
  const view = state.view;
  document.body.dataset.view = view;
  $('#tour-btn').hidden = view !== 'home' || state.tapas.filter(isToday).length < 2;
  const html = view === 'bar' ? barHTML()
    : view === 'search' ? searchHTML()
      : view === 'upload' ? uploadHTML()
        : view === 'alta' ? altaHTML()
          : view === 'panel' ? panelHTML()
            : view === 'report' ? reportHTML()
              : view === 'route' ? routeHTML()
                : view === 'tour' ? tourHTML()
                : homeHTML();
  const body = $('#sheet-body');
  // Al repintar sin cambiar de pantalla se conserva el desplazamiento y el campo con el foco.
  const focusId = document.activeElement?.id && body.contains(document.activeElement) ? document.activeElement.id : null;
  const caret = focusId ? document.activeElement.selectionStart : null;
  const reels = [...body.querySelectorAll('.reel, .chips')].map((r) => r.scrollLeft);
  body.innerHTML = html;
  body.querySelectorAll('.reel, .chips').forEach((r, i) => { if (reels[i]) r.scrollLeft = reels[i]; });
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus({ preventScroll: true }); try { if (caret != null) el.setSelectionRange(caret, caret); } catch { /* no es de texto */ } }
  }
  $('#aim').hidden = !(view === 'alta' && state.alta?.aiming);
  updateMap();
}

/** Baja (o sube) hasta la foto de la tapa en la ficha del bar, que va debajo del perfil. */
function scrollToPhoto(smooth = false) {
  const body = $('#sheet-body');
  const photo = body.querySelector('.photo');
  if (!photo) return;
  const top = body.scrollTop + photo.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
  body.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduced ? 'smooth' : 'auto' });
}

function setView(view, size) {
  const changed = state.view !== view;
  state.view = view;
  const sheet = $('#sheet');
  sheet.dataset.size = size ?? (TALL.includes(view) ? 'tall' : 'mid');
  render();
  if (changed) $('#sheet-body').scrollTop = 0;
}

/* ---------- Navegación con la dirección ---------- */
function go(hash) {
  navigated = true;
  if (location.hash.slice(1) === hash) route();
  else location.hash = hash;
}
function goBack() {
  if (navigated && history.length > 1) history.back();
  else go('');
}

function route() {
  const raw = decodeURIComponent(location.hash.slice(1));
  const [name, a, b] = raw.split('/');
  if (name !== 'alta' && state.alta?.aiming) state.alta.aiming = false;
  if (name !== 'ruta' && state.nav) closeNav();
  if (name !== 'tapeo' && state.tour) closeTour();
  if (name === 'tapeo') {
    setView('tour', 'mid');
    if (!state.tour) startTour();
    return;
  }
  if (name === 'ruta' && a) {
    if (state.nav?.bar !== a) { closeNav(); state.nav = { bar: a, status: 'locating' }; }
    state.barId = a;
    setView('route', 'mid');
    if (state.nav.status === 'locating' && !state.nav.started) startNav();
    return;
  }
  if (name === 'bar' && a) {
    if (state.barId !== a) { state.bar = null; state.tapaId = null; }
    // Si se abrió una tapa concreta (desde el muro, las historias o el top), se va directo a su foto.
    const toPhoto = Boolean(state.pendingTapa);
    if (state.pendingTapa) { state.tapaId = state.pendingTapa; state.pendingTapa = null; }
    state.barId = a;
    setView('bar');
    if (toPhoto) scrollToPhoto();
    const bar = state.barById.get(a);
    if (bar) flyTo(bar.lon, bar.lat);
    loadBar(a).then(() => {
      if (state.view === 'bar' && state.barId === a) {
        render();
        if (toPhoto) scrollToPhoto();
        const known = state.barById.get(a);
        if (!bar && known) flyTo(known.lon, known.lat);
      }
    });
    return;
  }
  if (name === 'subir') {
    if (!SUBEN_CLIENTES && !(state.mine && (!a || a === state.mine.bar))) { history.replaceState(null, '', location.pathname + location.search); route(); return; }
    const barId = a && state.barById.has(a) ? a : (SUBEN_CLIENTES ? null : state.mine.bar);
    if (!state.upload || state.upload.done || (a && state.upload.bar !== a)) state.upload = { bar: barId, photo: null, nombre: '', tipos: [], nota: '', q: '' };
    setView('upload');
    return;
  }
  if (name === 'alta') {
    if (!state.alta || state.alta.sent || (a && state.alta.osm !== a)) {
      const bar = a ? state.barById.get(a) : null;
      state.alta = bar && !bar.reg
        ? { osm: bar.id, nombre: bar.nombre, dir: bar.dir, lat: bar.lat, lon: bar.lon, contacto: '', insta: '', mensaje: '' }
        : { osm: '', nombre: '', dir: '', lat: NaN, lon: NaN, contacto: '', insta: '', mensaje: '' };
    }
    setView('alta');
    return;
  }
  if (name === 'panel') {
    if (a && b) {
      state.mine = { bar: a, clave: b };
      store.set('quetapa-mibar', state.mine);
      // La clave no se queda en la barra de direcciones ni en el historial.
      history.replaceState(null, '', '#panel');
    }
    state.panel = null;
    setView('panel');
    loadPanel();
    return;
  }
  if (name === 'reportar') {
    if (!state.report || state.report.sent) state.report = { bar: '', tapa: '', tipo: 'otro', texto: '', contacto: '' };
    setView('report');
    return;
  }
  state.barId = null;
  setView('home');
}

/* ---------- Ruta a pie y navegación ---------- */
let navTools = null;
async function loadNavTools() {
  if (navTools) return navTools;
  const [mod, streets] = await Promise.all([import('./ruta.js'), loadStreets()]);
  navTools = { mod, g: mod.buildGraph(streets) };
  return navTools;
}
function drawRoute(coords) {
  if (!mapReady) return;
  map.getSource('ruta')?.setData({ type: 'FeatureCollection', features: coords?.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [] });
}
function fitRoute(coords) {
  if (!map || !coords?.length) return;
  const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
  for (const c of coords) b.extend(c);
  // fitBounds suma su margen al que ya tiene el mapa: se quita antes para no contarlo dos veces.
  map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
  const pad = mapPadding();
  pad.top += 60; // la foto del bar sobresale por encima de su punto
  map.fitBounds(b, { padding: pad, maxZoom: 17.5, duration: reduced ? 0 : 700 });
}
const currentPosition = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) { reject(new Error('sin GPS')); return; }
  navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 });
});

async function startNav() {
  const n = state.nav;
  const bar = state.barById.get(n.bar);
  if (!bar) return; // se vuelve a intentar cuando llegan los datos
  n.started = true;
  n.status = 'locating';
  render();
  let me;
  try { me = await currentPosition(); } catch { if (state.nav === n) { n.status = 'nogps'; n.started = false; render(); } return; }
  if (state.nav !== n) return;
  state.me = me;
  updateMap();
  if (distance(me, bar) > 8000) { n.status = 'far'; render(); return; }
  let route = null;
  try {
    const { mod, g } = await loadNavTools();
    route = mod.walkRoute(g, [me.lon, me.lat], [bar.lon, bar.lat]);
  } catch { /* sin callejero: se queda en «lejos» con los botones de fuera */ }
  if (state.nav !== n) return;
  if (!route) { n.status = 'far'; render(); return; }
  Object.assign(n, { status: 'ok', coords: route.coords, metros: route.metros, left: route.metros, rest: route.coords });
  drawRoute(route.coords);
  render();
  // Primero se pinta el panel (cambia de alto) y luego se encuadra la ruta en el hueco que queda.
  requestAnimationFrame(() => fitRoute(route.coords));
}

async function keepAwake(n) {
  try { n.lock = await navigator.wakeLock?.request('screen'); } catch { /* el navegador no deja: no pasa nada */ }
}

function startFollow() {
  const n = state.nav;
  if (!n?.coords) return;
  n.following = true;
  keepAwake(n);
  n.watch = navigator.geolocation?.watchPosition(onMove, (err) => {
    // Solo se avisa si se quita el permiso; un rato sin señal no es para alarmar.
    if (err?.code === 1) toast(t('Se ha perdido la ubicación. Sigue con tu app de mapas si hace falta.'), 4000);
  }, { enableHighAccuracy: true, maximumAge: 3000 });
  if (state.me) map?.easeTo({ center: [state.me.lon, state.me.lat], zoom: 17.5, padding: mapPadding(), duration: reduced ? 0 : 600 });
  render();
}

function onMove(p) {
  const n = state.nav;
  if (!n?.following || !navTools) return;
  const me = { lat: p.coords.latitude, lon: p.coords.longitude };
  state.me = me;
  const bar = state.barById.get(n.bar);
  if (bar && distance(me, bar) < 25) {
    stopFollow();
    n.arrived = true;
    drawRoute(null);
    navigator.vibrate?.([80, 60, 80]);
    render();
    updateMap();
    return;
  }
  const prog = navTools.mod.progressOn(n.coords, me.lon, me.lat);
  if (prog.off > 40 && Date.now() - (n.recalc ?? 0) > 5000 && bar) {
    // Se ha salido del camino: ruta nueva desde donde está.
    n.recalc = Date.now();
    const route = navTools.mod.walkRoute(navTools.g, [me.lon, me.lat], [bar.lon, bar.lat]);
    if (route) Object.assign(n, { coords: route.coords, left: route.metros, rest: route.coords });
  } else {
    n.left = prog.left;
    n.rest = prog.rest;
  }
  drawRoute(n.rest);
  updateMap();
  map?.easeTo({ center: [me.lon, me.lat], zoom: Math.max(map.getZoom(), 16.5), padding: mapPadding(), duration: reduced ? 0 : 800 });
  if (state.view === 'route') render();
}

function stopFollow() {
  const n = state.nav;
  if (!n) return;
  if (n.watch != null) navigator.geolocation?.clearWatch(n.watch);
  n.watch = null;
  n.following = false;
  n.lock?.release?.().catch?.(() => {});
  n.lock = null;
}

function closeNav() {
  stopFollow();
  state.nav = null;
  drawRoute(null);
}

async function loadPanel() {
  if (!state.mine) { render(); return; }
  if (DEMO) {
    const bar = state.barById.get(state.mine.bar) ?? state.bares[0];
    const mine = state.tapas.filter((x) => x.bar === bar.id);
    state.panel = { fecha: state.fecha, bar, tapas: mine, hoy: { tapas: mine.filter(isToday).length }, total: { tapas: mine.length, votos: bar.votos ?? 0, media: bar.media ?? 0 } };
    render();
    return;
  }
  try {
    state.panel = await postJSON('/panel', { bar: state.mine.bar, clave: state.mine.clave });
    state.mine.nombre = state.panel.bar.nombre;
    store.set('quetapa-mibar', state.mine);
  } catch (err) {
    state.panel = err.status === 403 ? { error: errorText(err) } : null;
    if (err.status !== 403) toast(errorText(err));
  }
  if (state.view === 'panel') render();
}

/* ---------- Fotos: se reducen y se pasan a JPEG en el móvil ---------- */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
    img.src = url;
  });
}
const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
const toBase64 = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.readAsDataURL(blob);
});
function draw(source, w, h, sx, sy, sw, sh) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  return canvas;
}
async function processImage(file) {
  let source;
  try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { source = await loadImage(file); }
  const w = source.width;
  const h = source.height;
  if (Math.min(w, h) < 200) throw new Error(t('La foto es demasiado pequeña.'));
  let side = MAX_SIDE;
  let big;
  for (const quality of [0.82, 0.74, 0.66]) {
    const scale = Math.min(1, side / Math.max(w, h));
    big = await toBlob(draw(source, Math.round(w * scale), Math.round(h * scale), 0, 0, w, h), quality);
    if (big.size < 1_350_000) break;
    side = 1080;
  }
  const crop = Math.min(w, h);
  const mini = await toBlob(draw(source, MINI_SIDE, MINI_SIDE, (w - crop) / 2, (h - crop) / 2, crop, crop), 0.8);
  source.close?.();
  return { big: await toBase64(big), mini: await toBase64(mini), url: URL.createObjectURL(big) };
}

/** El logo: un cuadrado de 512 px (y otro de 160 para las miniaturas), recortado al centro. */
async function processLogo(file) {
  let source;
  try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { source = await loadImage(file); }
  const w = source.width;
  const h = source.height;
  if (Math.min(w, h) < 200) throw new Error(t('La foto es demasiado pequeña.'));
  const crop = Math.min(w, h);
  const sx = (w - crop) / 2;
  const sy = (h - crop) / 2;
  const big = await toBlob(draw(source, 512, 512, sx, sy, crop, crop), 0.86);
  const mini = await toBlob(draw(source, 160, 160, sx, sy, crop, crop), 0.82);
  source.close?.();
  return { foto: await toBase64(big), mini: await toBase64(mini) };
}

async function sendLogo(file) {
  if (!state.mine || !state.panel?.bar || state.logoBusy) return;
  state.logoBusy = true;
  render();
  try {
    const body = { bar: state.mine.bar, clave: state.mine.clave };
    if (file) Object.assign(body, await processLogo(file)); else body.quitar = true;
    if (DEMO) throw new Error(t('En el modo de ejemplo no se sube nada.'));
    const res = await postJSON('/logo', body);
    for (const b of new Set([state.panel.bar, state.barById.get(state.mine.bar)].filter(Boolean))) { if (res.logo) b.logo = res.logo; else delete b.logo; }
    toast(res.logo ? t('Logo guardado.') : t('Logo quitado.'));
  } catch (err) {
    toast(err.message && err.message !== 'imagen' ? err.message : t('No se pudo abrir esa foto. Prueba con otra.'));
  }
  state.logoBusy = false;
  render();
}

async function onFile(file) {
  if (!file || !state.upload) return;
  state.upload.processing = true;
  render();
  try {
    const photo = await processImage(file);
    if (state.upload.photo?.url) URL.revokeObjectURL(state.upload.photo.url);
    state.upload.photo = photo;
  } catch (err) {
    toast(err.message && err.message !== 'imagen' ? err.message : t('No se pudo abrir esa foto. Prueba con otra.'));
  }
  state.upload.processing = false;
  render();
  if (state.upload.photo && !state.upload.nombre) document.getElementById('up-nombre')?.focus({ preventScroll: false });
}

async function sendUpload() {
  const up = state.upload;
  const bar = state.barById.get(up.bar);
  if (!bar || !up.photo || up.sending) return;
  const owner = state.mine?.bar === bar.id;
  up.sending = true;
  render();
  try {
    if (DEMO) {
      await new Promise((r) => setTimeout(r, 600));
      toast(t('Modo de ejemplo: no se ha enviado nada.'));
    } else {
      await postJSON('/tapas', {
        bar: bar.id, nombre: up.nombre.trim(), tipos: up.tipos, nota: owner ? up.nota.trim() : '',
        foto: up.photo.big, mini: up.photo.mini, ...(owner ? { clave: state.mine.clave } : {}), web: $('#up-web')?.value ?? '',
      });
    }
    up.done = true;
    if (owner) { loadToday({ quiet: true }); state.panel = null; }
  } catch (err) {
    toast(errorText(err), 4500);
  }
  up.sending = false;
  render();
}

/* ---------- Notas de 1 a 5 ---------- */
async function rate(id, nota) {
  const all = [state.tapas.find((x) => x.id === id), state.bar?.tapas.find((x) => x.id === id)].filter(Boolean);
  const tapa = all[0];
  if (!tapa || !canRate(tapa)) return;
  const antes = state.notas[id]?.nota ?? 0;
  if (antes === nota) return;
  // Se pinta al momento con la cuenta aproximada; luego manda la que devuelve el servidor.
  const votos = tapa.votos + (antes ? 0 : 1);
  const media = (tapa.media * tapa.votos - antes + nota) / votos;
  for (const x of new Set(all)) Object.assign(x, { votos, media });
  // Y la media del bar, que junta todas sus tapas.
  for (const b of new Set([state.barById.get(tapa.bar), state.bar?.bar].filter((b) => b?.id === tapa.bar))) {
    const bv = (b.votos ?? 0) + (antes ? 0 : 1);
    b.media = ((b.media ?? 0) * (b.votos ?? 0) - antes + nota) / bv;
    b.votos = bv;
  }
  state.notas[id] = { nota, fecha: tapa.fecha };
  store.set('quetapa-notas', state.notas);
  navigator.vibrate?.(15);
  render();
  if (DEMO || tapa.autor === 'ejemplo') return; // las notas a tapas de ejemplo solo cuentan en este móvil
  try {
    const res = await postJSON('/voto', { tapa: id, nota });
    for (const x of new Set(all)) Object.assign(x, { votos: res.votos, media: res.media });
    render();
    loadToday({ quiet: true });
  } catch (err) { toast(errorText(err)); }
}

/** Una historia abierta pasa a «vista» (aro gris). Se guardan solo las de esta semana. */
function markSeen(id) {
  if (!id || state.vistos.has(id)) return;
  state.vistos.add(id);
  const vivos = new Set(state.tapas.map((x) => x.id));
  store.set('quetapa-vistos', [...state.vistos].filter((x) => vivos.has(x)).slice(-300));
}

/* ---------- Seguir bares ---------- */
async function follow(id) {
  const bar = state.barById.get(id) ?? state.bar?.bar;
  if (!bar) return;
  const on = !isFollowing(id);
  state.favs = on ? [id, ...state.favs].slice(0, 60) : state.favs.filter((x) => x !== id);
  store.set('quetapa-favs', state.favs);
  for (const b of new Set([bar, state.barById.get(id), state.bar?.bar?.id === id ? state.bar.bar : null].filter(Boolean))) b.seguidores = Math.max(0, (b.seguidores ?? 0) + (on ? 1 : -1));
  navigator.vibrate?.(10);
  toast(on ? t('Ahora sigues a {bar}', { bar: bar.nombre }) : t('Has dejado de seguir a {bar}', { bar: bar.nombre }));
  render();
  if (DEMO || id.startsWith('ejemplo-')) return;
  try { await postJSON('/seguir', { bar: id, id: state.deviceId, on }); } catch { /* el móvil ya lo recuerda; el contador se arregla la próxima vez */ }
}
/** Los bares guardados antes de que existiera «Seguir» se cuentan una vez como seguidos. */
function syncFollows() {
  if (DEMO || store.get('quetapa-seguir-sync', false) || !state.favs.length) return;
  store.set('quetapa-seguir-sync', true);
  for (const id of state.favs) if (!id.startsWith('ejemplo-')) postJSON('/seguir', { bar: id, id: state.deviceId, on: true }).catch(() => {});
}

/* ---------- Compartir ---------- */
async function share({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch (err) { if (err?.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast(t('Enlace copiado. Pégalo donde quieras.'));
  } catch {
    prompt(t('Copia este enlace:'), url);
  }
}
function shareBar(id) {
  const bar = state.barById.get(id) ?? state.panel?.bar;
  if (!bar) return;
  const tapa = state.latest.get(id);
  // /compartir/<bar> sale en WhatsApp con la foto de la tapa de hoy; al abrirlo, lleva a la ficha.
  const url = DEMO || id.startsWith('ejemplo-') ? `${location.origin}/#bar/${encodeURIComponent(id)}` : `${location.origin}/compartir/${encodeURIComponent(id)}`;
  const text = tapa && isToday(tapa)
    ? t('🔥 Hoy en {bar} ponen {tapa}. Míralo en Que Tapa!', { bar: bar.nombre, tapa: tapa.nombre })
    : t('🍷 Mira la tapa de hoy en {bar}, en Que Tapa!', { bar: bar.nombre });
  share({ title: `Que Tapa! · ${bar.nombre}`, text, url });
}

/* ---------- Clics y escritura en el panel ---------- */
function bindSheet() {
  const body = $('#sheet-body');
  body.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const d = el.dataset;
    switch (act) {
      case 'back': goBack(); break;
      case 'go': go(d.to ?? ''); break;
      case 'open-bar': go(`bar/${d.bar}`); break;
      case 'open-tapa':
        state.pendingTapa = d.tapa;
        markSeen(d.tapa);
        go(`bar/${d.bar}`);
        break;
      case 'pick-tapa': state.tapaId = d.tapa; render(); scrollToPhoto(true); break;
      case 'filter': state.filter = d.filter; state.feedN = FEED_PAGE; render(); break;
      case 'tab': state.tab = d.tab; state.feedN = FEED_PAGE; render(); break;
      case 'more': state.feedN += FEED_PAGE; render(); break;
      case 'follow': follow(d.bar); break;
      case 'tour-again': startTour((state.tour?.seed ?? 0) + 1); break;
      case 'rate': rate(d.tapa, Number(d.nota)); break;
      case 'share': shareBar(state.barId); break;
      case 'share-bar': shareBar(d.bar); break;
      case 'upload': go(d.bar ? `subir/${d.bar}` : 'subir'); break;
      case 'locate': locate(); break;
      case 'up-bar': state.upload.bar = d.bar; history.replaceState(null, '', `#subir/${d.bar}`); render(); body.scrollTop = 0; break;
      case 'up-change': state.upload.bar = null; history.replaceState(null, '', '#subir'); render(); break;
      case 'pick-camera': $('#file-camera').click(); break;
      case 'pick-logo': $('#file-logo').click(); break;
      case 'del-logo': sendLogo(null); break;
      case 'pick-gallery': $('#file-gallery').click(); break;
      case 'up-idea': state.upload.nombre = d.idea; render(); break;
      case 'up-tipo': {
        const tipos = state.upload.tipos;
        state.upload.tipos = tipos.includes(d.tipo) ? tipos.filter((x) => x !== d.tipo) : [...tipos, d.tipo].slice(-3);
        render();
        break;
      }
      case 'up-send': sendUpload(); break;
      case 'search-close': closeSearch(); break;
      case 'nav-start': startFollow(); break;
      case 'nav-stop': stopFollow(); render(); if (state.nav?.coords) { drawRoute(state.nav.coords); requestAnimationFrame(() => fitRoute(state.nav.coords)); } break;
      case 'nav-retry': if (state.nav) { state.nav.started = false; startNav(); } break;
      case 'alta-here':
        if (!navigator.geolocation) { toast(t('Este navegador no puede saber dónde estás.')); break; }
        toast(t('Buscando dónde estás…'), 6000);
        navigator.geolocation.getCurrentPosition((pos) => {
          state.alta.lat = pos.coords.latitude;
          state.alta.lon = pos.coords.longitude;
          $('#toast').hidden = true;
          state.me = { lat: state.alta.lat, lon: state.alta.lon };
          flyTo(state.alta.lon, state.alta.lat, 17.5);
          render();
        }, () => toast(t('No se pudo saber dónde estás. Márcalo en el mapa.')), { enableHighAccuracy: true, timeout: 10000 });
        break;
      case 'aim':
        state.alta.aiming = true;
        setView('alta', 'mid');
        if (Number.isFinite(state.alta.lat)) map?.jumpTo({ center: [state.alta.lon, state.alta.lat], zoom: 17.5 });
        else map?.easeTo({ zoom: Math.max(map.getZoom(), 16.5), duration: reduced ? 0 : 400 });
        break;
      case 'aim-ok': {
        let c = { lat: CENTER[1], lng: CENTER[0] };
        if (map) {
          const aim = $('#aim').getBoundingClientRect();
          const box = map.getContainer().getBoundingClientRect();
          c = map.unproject([aim.left - box.left, aim.top - box.top]);
        }
        state.alta.lat = c.lat;
        state.alta.lon = c.lng;
        state.alta.aiming = false;
        setView('alta', 'tall');
        break;
      }
      case 'aim-cancel': state.alta.aiming = false; setView('alta', 'tall'); break;
      case 'alta-send': sendAlta(); break;
      case 'logout':
        state.mine = null;
        state.panel = null;
        store.del('quetapa-mibar');
        go('');
        break;
      case 'install':
        state.installPrompt?.prompt();
        state.installPrompt = null;
        render();
        break;
      case 'del-tapa':
        if (state.confirmDelete !== d.tapa) { state.confirmDelete = d.tapa; render(); break; }
        state.confirmDelete = null;
        try {
          if (!DEMO) await postJSON('/tapas/borrar', { bar: state.mine.bar, clave: state.mine.clave, tapa: d.tapa });
          toast(t('Tapa borrada'));
          await loadPanel();
          loadToday({ quiet: true });
        } catch (err) { toast(errorText(err)); }
        break;
      case 'report':
        state.report = { bar: d.bar ?? '', tapa: d.tapa ?? '', tipo: d.bar ? 'foto' : 'otro', texto: '', contacto: '' };
        go('reportar');
        break;
      case 'rep-send': sendReport(); break;
      case 'lang':
        setLang(d.lang);
        paintThemeButton();
        render();
        break;
      default: break;
    }
  });

  body.addEventListener('input', (e) => {
    const { id, value } = e.target;
    if (id === 'up-nombre') { state.upload.nombre = value; syncButton('up-send', state.upload.photo && value.trim().length >= 2); }
    else if (id === 'up-nota') state.upload.nota = value;
    else if (id === 'up-q') { state.upload.q = value; render(); }
    else if (id.startsWith('al-')) {
      const key = id.slice(3);
      if (key !== 'web') state.alta[key] = value;
      const a = state.alta;
      syncButton('alta-send', a.nombre.trim().length >= 2 && a.contacto.trim().length >= 5 && Number.isFinite(a.lat));
    } else if (id === 'rep-texto') state.report.texto = value;
    else if (id === 'rep-contacto') state.report.contacto = value;
  });
  body.addEventListener('change', (e) => {
    if (e.target.name === 'rep-tipo') state.report.tipo = e.target.value;
  });
}
function closeSearch() {
  const q = $('#q');
  q.value = '';
  state.query = '';
  q.blur();
  route();
}
function syncButton(act, enabled) {
  const b = $(`[data-act="${act}"]`);
  if (b) b.disabled = !enabled;
}

async function sendAlta() {
  const a = state.alta;
  if (a.sending) return;
  a.sending = true;
  render();
  try {
    if (!DEMO) {
      await postJSON('/altas', { nombre: a.nombre.trim(), dir: a.dir.trim(), lat: a.lat, lon: a.lon, contacto: a.contacto.trim(), insta: a.insta.trim(), mensaje: a.mensaje.trim(), osm: a.osm, web: $('#al-web')?.value ?? '' });
    }
    a.sent = true;
  } catch (err) { toast(errorText(err), 4500); }
  a.sending = false;
  render();
}

async function sendReport() {
  const r = state.report;
  if (r.sending) return;
  if (!r.texto.trim() && !r.bar) { toast(t('Cuéntanos qué pasa.')); return; }
  r.sending = true;
  render();
  try {
    if (!DEMO) await postJSON('/reportes', { tipo: r.tipo, texto: r.texto.trim(), contacto: r.contacto.trim(), bar: r.bar, tapa: r.tapa, web: $('#rep-web')?.value ?? '' });
    r.sent = true;
  } catch (err) { toast(errorText(err)); }
  r.sending = false;
  render();
}

/* ---------- Panel inferior: se arrastra desde el asa o el título (como en Xa Vén) ---------- */
function bindSheetDrag() {
  const sheet = $('#sheet');
  const viewport = window.visualViewport;
  const syncViewport = () => {
    if (!viewport) return;
    const root = document.documentElement.style;
    root.setProperty('--vvh', `${Math.round(viewport.height)}px`);
    root.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`);
    if (window.scrollY) window.scrollTo(0, 0);
  };
  viewport?.addEventListener('resize', syncViewport);
  viewport?.addEventListener('scroll', syncViewport);
  syncViewport();
  const SIZES = ['peek', 'mid', 'tall'];
  let drag = null;
  let settling = 0;
  let varTimer = 0;
  const syncSheetVar = () => {
    if (desktop.matches) { document.documentElement.style.removeProperty('--sheet-h'); return; }
    if (drag?.moved || settling) return;
    const h = `${Math.round(sheet.getBoundingClientRect().height)}px`;
    if (document.documentElement.style.getPropertyValue('--sheet-h') !== h) document.documentElement.style.setProperty('--sheet-h', h);
  };
  const clearSheet = (size) => {
    clearTimeout(settling);
    settling = 0;
    sheet.classList.remove('dragging', 'settling');
    sheet.style.height = '';
    sheet.style.maxHeight = '';
    sheet.style.transform = '';
    if (size) sheet.dataset.size = size;
    syncSheetVar();
  };
  const measure = () => {
    const saved = sheet.dataset.size;
    const out = SIZES.map((size) => { sheet.dataset.size = size; return sheet.getBoundingClientRect().height; });
    sheet.dataset.size = saved;
    return out;
  };
  sheet.addEventListener('pointerdown', (e) => {
    if (desktop.matches || !e.target.closest('#grab, .head, .eyebrow')) return;
    if (e.target.closest('button:not(#grab), a, input')) return;
    if (settling) clearSheet(sheet.dataset.size);
    drag = { id: e.pointerId, y: e.clientY, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0, onGrab: Boolean(e.target.closest('#grab')) };
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dy) < 6) return;
      drag.moved = true;
      drag.startH = sheet.getBoundingClientRect().height;
      drag.heights = measure();
      drag.full = Math.round(window.innerHeight * 0.92);
      sheet.setPointerCapture(e.pointerId);
      sheet.classList.add('dragging');
      sheet.style.height = `${drag.full}px`;
      sheet.style.maxHeight = 'none';
    }
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.v = (e.clientY - drag.lastY) / dt;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    drag.visible = Math.max(96, Math.min(drag.full, drag.startH - dy));
    sheet.style.transform = `translate3d(0, ${drag.full - drag.visible}px, 0)`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, v, onGrab, heights, full, visible, startH } = drag;
    drag = null;
    if (!moved) {
      if (onGrab && e.type === 'pointerup') sheet.dataset.size = SIZES[(SIZES.indexOf(sheet.dataset.size) + 1) % SIZES.length];
      return;
    }
    const now = visible ?? startH;
    let index = heights.reduce((best, h, i) => (Math.abs(h - now) < Math.abs(heights[best] - now) ? i : best), 0);
    if (v < -0.45) { const up = heights.findIndex((h) => h > startH + 1); index = up === -1 ? SIZES.length - 1 : up; }
    else if (v > 0.45) { index = 0; heights.forEach((h, i) => { if (h < startH - 1) index = i; }); }
    sheet.classList.remove('dragging');
    sheet.classList.add('settling');
    sheet.style.transform = `translate3d(0, ${full - heights[index]}px, 0)`;
    settling = setTimeout(() => clearSheet(SIZES[index]), reduced ? 0 : 230);
  };
  sheet.addEventListener('pointerup', endDrag);
  sheet.addEventListener('pointercancel', endDrag);
  new ResizeObserver(() => { clearTimeout(varTimer); varTimer = setTimeout(syncSheetVar, 60); }).observe(sheet);
  $('#sheet-body').addEventListener('touchmove', () => {
    const active = document.activeElement;
    if (active?.tagName === 'INPUT' && active.type === 'search') active.blur();
  }, { passive: true });
}

/* ---------- Arranque ---------- */
function start() {
  translateDom();
  paintThemeButton();
  bindSheet();
  bindSheetDrag();
  $('#theme').addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'));
  $('#locate').addEventListener('click', locate);
  $('#tour-btn').addEventListener('click', () => go('tapeo'));
  $('#zoom-in').addEventListener('click', () => map?.zoomIn());
  $('#zoom-out').addEventListener('click', () => map?.zoomOut());
  $('#credit').addEventListener('click', () => toast(t('Mapa: OpenFreeMap © OpenMapTiles. Bares: © colaboradores de OpenStreetMap.'), 5000));
  for (const id of ['#file-camera', '#file-gallery']) {
    $(id).addEventListener('change', (e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f); });
  }
  $('#file-logo').addEventListener('change', (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) sendLogo(f); });
  const q = $('#q');
  q.addEventListener('focus', () => { if (state.view !== 'search') { state.query = q.value; setView('search', 'tall'); } });
  q.addEventListener('input', () => { state.query = q.value; render(); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });
  q.addEventListener('search', () => { if (!q.value) { state.query = ''; render(); } });
  $('.brand').addEventListener('click', (e) => { e.preventDefault(); go(''); });
  window.addEventListener('hashchange', () => { q.value = ''; state.query = ''; route(); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; if (state.view === 'panel') render(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    loadToday({ quiet: true });
    if (state.nav?.following) keepAwake(state.nav);
  });
  setInterval(() => { if (document.visibilityState === 'visible') loadToday({ quiet: true }); }, 120000);

  route();
  initMap();
  loadToday().then(() => {
    syncFollows();
    if (!['home', 'search'].includes(state.view)) route();
    setTimeout(recenter, 120);
  });
  if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
