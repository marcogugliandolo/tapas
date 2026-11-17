// Que Tapa!: el mapa de las tapas de Lugo. Una sola página: el mapa con las fotos de las tapas
// de hoy y un panel (abajo en el móvil, a la izquierda en el ordenador) con lo demás.
// Las pantallas se abren con la dirección (#bar/…, #subir, #alta, #panel, #reportar), así el botón
// «atrás» del móvil funciona y cualquier bar se puede compartir con un enlace.
import { t, getLang, setLang, translateDom } from './i18n.js';

const API = '/api';
const CENTER = [-7.5566, 43.0108];
const TILES_CHECK = 'https://tiles.openfreemap.org/planet';
const DEMO = /[?&](ejemplo|exemplo)\b/.test(location.search);
const MAX_SIDE = 1280;
const MINI_SIDE = 240;

export const TIPOS = {
  carne: ['🥩', 'Carne'],
  mar: ['🦑', 'Del mar'],
  cuchara: ['🥘', 'De cuchara'],
  huevo: ['🍳', 'Huevo y tortilla'],
  veggie: ['🥦', 'Vegetariana'],
  'sin-gluten': ['🌾', 'Sin gluten'],
};
const IDEAS = ['Raxo', 'Callos', 'Tortilla', 'Pulpo', 'Zorza', 'Empanada', 'Croquetas', 'Oreja', 'Liscos', 'Calamares', 'Lacón', 'Pimientos'];
const EMOJI_OF = { carne: '🥩', mar: '🦑', cuchara: '🥘', huevo: '🍳', veggie: '🥦', 'sin-gluten': '🌾' };

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
  fuegos: {},
  mine: null,
  upload: null,
  alta: null,
  panel: null,
  report: null,
  confirmDelete: null,
  installPrompt: null,
};
let navigated = false;

/* ---------- Lo que se guarda en el móvil ---------- */
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* solo esta visita */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* nada */ } },
};
state.favs = store.get('quetapa-favs', []).filter((x) => typeof x === 'string').slice(0, 30);
state.fuegos = store.get('quetapa-fuegos', {});
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
const emojiFor = (tapa) => EMOJI_OF[tapa?.tipos?.[0]] ?? '🍢';
const tipoLabel = (k) => `${TIPOS[k][0]} ${t(TIPOS[k][1])}`;

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
  for (const [id, fecha] of Object.entries(state.fuegos)) if (daysBetween(fecha, state.fecha) > 7) delete state.fuegos[id];
  store.set('quetapa-fuegos', state.fuegos);
}

async function loadToday({ quiet = false } = {}) {
  if (DEMO) {
    const { demoData } = await import('./demo.js');
    apply(demoData(t));
  } else {
    try {
      const res = await fetch(`${API}/hoy`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      apply(data);
      state.offline = false;
      store.set('quetapa-hoy', data);
    } catch {
      const saved = store.get('quetapa-hoy', null);
      if (saved && !state.loaded) apply(saved);
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
      if (state.barId === id) state.bar = data;
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
  map.setPaintProperty('bares-dot', 'circle-stroke-color', isDark() ? '#1F1714' : '#FFFFFF');
}

async function buildStyle(remote) {
  if (remote) {
    const { style, themes } = await fetch('data/map-style.json').then((r) => r.json());
    themeTable = themes;
    return paintStyle(style);
  }
  // Sin el mapa de fuera (sin conexión o bloqueado): las calles de Lugo, guardadas en la web.
  const streets = await fetch('data/streets.json').then((r) => r.json());
  themeTable = {
    light: { bg: { 'background-color': '#F6EEE3' }, streets: { 'line-color': '#FFFFFF' } },
    dark: { bg: { 'background-color': '#1A1512' }, streets: { 'line-color': '#3A2C25' } },
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
  map.addSource('bares', { type: 'geojson', data: barsGeoJSON() });
  map.addLayer({
    id: 'bares-dot',
    type: 'circle',
    source: 'bares',
    minzoom: 13.2,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13.2, 2.5, 15, ['case', ['==', ['get', 'reg'], 1], 6, 4.5], 18, ['case', ['==', ['get', 'reg'], 1], 9, 7]],
      'circle-color': ['case', ['==', ['get', 'reg'], 1], '#F0431C', '#B08A70'],
      'circle-stroke-color': isDark() ? '#1F1714' : '#FFFFFF',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13.2, 1, 16, 2],
    },
  });
  mapReady = true;
  applyMapTheme();
  updateMap();
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
  const sel = state.barId === bar.id && state.view === 'bar';
  el.classList.toggle('old', !today);
  el.classList.toggle('hot', today && rank < 3 && tapa.fuegos > 0);
  el.classList.toggle('sel', sel);
  wrap.classList.toggle('sel', sel);
  wrap.classList.toggle('today', today);
  const img = el.querySelector('img');
  const want = src(tapa, true);
  if (img.getAttribute('src') !== want) img.src = want;
  const fl = el.querySelector('.fl');
  fl.hidden = !(today && tapa.fuegos > 0);
  fl.textContent = `🔥${tapa.fuegos}`;
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
  const ranked = [...state.latest.values()].filter(isToday).sort((a, b) => b.fuegos - a.fuegos);
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
  const selected = state.view === 'bar' && state.barId && !pins.has(state.barId) ? state.barById.get(state.barId) : null;
  if (selected) {
    if (!ghost) {
      const el = document.createElement('div');
      el.className = 'pin-wrap sel';
      el.innerHTML = '<span class="pin ghost sel"><span class="ring"><span class="emo">🍢</span></span></span>';
      ghost = new maplibregl.Marker({ element: el, anchor: 'bottom' });
    }
    ghost.setLngLat([selected.lon, selected.lat]).addTo(map);
  } else ghost?.remove();
  if (state.me) {
    if (!mePin) {
      const el = document.createElement('div');
      el.className = 'me-dot';
      mePin = new maplibregl.Marker({ element: el });
    }
    mePin.setLngLat([state.me.lon, state.me.lat]).addTo(map);
  }
  declutter();
}

/** Si dos fotos se tapan, se queda la más votada de hoy (y siempre la del bar abierto). */
let declutterQueued = false;
function scheduleDeclutter() {
  if (declutterQueued) return;
  declutterQueued = true;
  requestAnimationFrame(() => { declutterQueued = false; declutter(); });
}
function declutter() {
  if (!map) return;
  const shown = [];
  const list = [...pins.entries()].sort((a, b) => (a[0] === state.barId ? -1 : b[0] === state.barId ? 1 : a[1].rank - b[1].rank));
  const gap = map.getZoom() >= 17 ? 40 : 52;
  for (const [barId, entry] of list) {
    const p = map.project(entry.lngLat);
    const clash = barId !== state.barId && shown.some((q) => Math.abs(q.x - p.x) < gap && Math.abs(q.y - p.y) < gap + 8);
    entry.wrap.style.visibility = clash ? 'hidden' : '';
    if (!clash) shown.push(p);
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
const BACK_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>';
const STAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"></path></svg>';
const STAR_OFF = STAR.replace('fill="currentColor"', 'fill="none"');
const SHARE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"></path><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"></path></svg>';
const PIN_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle></svg>';
const SHIELD = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z"></path><path d="M9 12l2 2 4-4" stroke-linecap="round"></path></svg>';
const BUBBLE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H10l-5 4v-4H4z"></path><path d="M12 8.5v3M12 13.8v.2" stroke-linecap="round"></path></svg>';

const back = () => `<button type="button" class="back" data-act="back" aria-label="${t('Volver')}" title="${t('Volver')}">${BACK_ICON}</button>`;
const privacyHref = () => (getLang() === 'gl' ? '/privacidade/' : '/privacidad/');
function foot({ bar = '', tapa = '' } = {}) {
  return `<footer class="end"><nav class="end-links" aria-label="${t('Más')}">
    <button type="button" data-act="report" data-bar="${esc(bar)}" data-tapa="${esc(tapa)}">${BUBBLE}${t('¿Algo no cuadra?')}</button>
    <a href="${privacyHref()}">${SHIELD}${t('Privacidad')}</a></nav>
    <p class="foot">${t('Web no oficial hecha en Lugo. Las fotos son de los bares y de la gente que va de viños.')}</p></footer>`;
}
function langSwitch() {
  const lang = getLang();
  return `<div class="lang" role="group" aria-label="${t('Idioma')}"><button type="button" data-act="lang" data-lang="es" aria-pressed="${lang === 'es'}">Castellano</button><button type="button" data-act="lang" data-lang="gl" aria-pressed="${lang === 'gl'}">Galego</button></div>`;
}
const demoBanner = () => (DEMO ? `<p class="demo-banner"><span aria-hidden="true">🧪</span><span><b>${t('Modo de ejemplo.')}</b> ${t('Bares y tapas inventados para ver cómo queda. No se envía nada.')}</span></p>` : '');

function card(tapa) {
  const bar = state.barById.get(tapa.bar);
  return `<button type="button" class="card${isToday(tapa) ? '' : ' old'}" data-act="open-tapa" data-bar="${esc(tapa.bar)}" data-tapa="${esc(tapa.id)}">
    <img src="${esc(src(tapa))}" alt="" loading="lazy" decoding="async">
    ${isNew(tapa) ? `<span class="new">${t('Nueva')}</span>` : ''}
    ${tapa.fuegos ? `<span class="flame">🔥 ${tapa.fuegos}</span>` : ''}
    <span class="txt"><strong>${esc(tapa.nombre)}</strong><small>${esc(bar?.nombre ?? '')} · ${esc(ago(tapa))}</small></span></button>`;
}

function barRow(bar, extra = '') {
  const tapa = state.latest.get(bar.id);
  const thumb = tapa ? `<img class="thumb" src="${esc(src(tapa, true))}" alt="" loading="lazy">` : '<span class="thumb" aria-hidden="true">🍷</span>';
  const sub = tapa ? `${isToday(tapa) ? t('Hoy') : esc(ago(tapa))}: ${esc(tapa.nombre)}` : (bar.dir ? esc(bar.dir) : t('Aún sin tapa hoy'));
  return `<button type="button" class="row" data-act="open-bar" data-bar="${esc(bar.id)}">${thumb}<span class="to"><strong>${esc(bar.nombre)}</strong><small>${sub}${extra}</small></span><span class="go" aria-hidden="true">›</span></button>`;
}

function filtered(list) {
  if (state.filter === 'top') return [...list].sort((a, b) => b.fuegos - a.fuegos || b.at.localeCompare(a.at));
  if (TIPOS[state.filter]) return list.filter((x) => x.tipos?.includes(state.filter));
  return list;
}

/* ---------- Portada ---------- */
function homeHTML() {
  const today = state.tapas.filter(isToday);
  const older = state.tapas.filter((x) => !isToday(x));
  const list = filtered(today);
  const counts = Object.fromEntries(Object.keys(TIPOS).map((k) => [k, today.filter((x) => x.tipos?.includes(k)).length]));
  const chip = (key, label, n, cls = '') => `<button type="button" class="chip ${cls}" data-act="filter" data-filter="${key}" aria-pressed="${state.filter === key}">${label}${n ? ` <span class="n">${n}</span>` : ''}</button>`;
  const chips = today.length ? `<div class="chips" role="group" aria-label="${t('Filtrar tapas')}">${chip('todas', t('Todas'), today.length)}${chip('top', `🔥 ${t('Las mejores')}`, 0, 'fire')}${Object.keys(TIPOS).filter((k) => counts[k]).map((k) => chip(k, tipoLabel(k), counts[k])).join('')}</div>` : '';

  const title = `<p class="eyebrow"><img src="icon.svg" width="26" height="26" alt=""><b>Que Tapa!</b><span>${t('As tapas de Lugo')}</span></p>
    <div class="head"><div><h1 class="mega">${t('Hoy en')} <em>Lugo</em></h1><small>${esc(dayLabel(state.fecha))}${state.loaded && today.length ? ` · ${plural(today.length, '1 tapa con foto', '{n} tapas con foto')}` : ''}</small></div></div>`;

  let main;
  if (!state.loaded) {
    main = `<p class="note">${t('Cargando las tapas de hoy…')}</p>`;
  } else if (!today.length) {
    main = `<div class="empty"><span class="plate" aria-hidden="true">🍢</span><strong>${t('Aún no hay tapas hoy')}</strong><p>${t('¿Estás de viños? Hazle una foto a la tapa que te pongan y sé el primero del día.')}</p>
      <button type="button" class="cta fire" data-act="upload">📸 ${t('Subir una tapa')}</button></div>`;
  } else {
    main = `${chips}<div class="reel">${list.length ? list.map(card).join('') : ''}</div>${list.length ? '' : `<p class="note">${t('Hoy no hay tapas de este tipo todavía.')}</p>`}`;
  }

  const ranked = [...today].sort((a, b) => b.fuegos - a.fuegos || a.at.localeCompare(b.at)).filter((x) => x.fuegos > 0).slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  const podium = ranked.length ? `<section class="rows"><h2 class="section-title">${t('Lo más deseado hoy')}<small>${t('votos de la gente')}</small></h2>
    ${ranked.map((x, i) => `<button type="button" class="row" data-act="open-tapa" data-bar="${esc(x.bar)}" data-tapa="${esc(x.id)}"><span class="medal" aria-hidden="true">${medals[i]}</span><img class="thumb" src="${esc(src(x, true))}" alt="" loading="lazy"><span class="to"><strong>${esc(x.nombre)}</strong><small>${esc(state.barById.get(x.bar)?.nombre ?? '')}</small></span><span class="score">🔥 ${x.fuegos}</span></button>`).join('')}</section>` : '';

  const near = state.me ? (() => {
    const bars = state.bares.map((b) => ({ b, d: distance(state.me, b) })).filter((x) => x.d < 1500).sort((a, b) => {
      const ta = state.latest.get(a.b.id);
      const tb = state.latest.get(b.b.id);
      return (tb && isToday(tb) ? 1 : 0) - (ta && isToday(ta) ? 1 : 0) || a.d - b.d;
    }).slice(0, 5);
    return bars.length ? `<section class="rows"><h2 class="section-title">${t('Cerca de ti')}</h2>${bars.map(({ b, d }) => barRow(b, ` · ${distanceText(d)}`)).join('')}</section>` : '';
  })() : '';

  const favBars = state.favs.map((id) => state.barById.get(id)).filter(Boolean);
  const favs = favBars.length ? `<section class="rows"><h2 class="section-title">${t('Tus bares')}</h2>${favBars.map((b) => barRow(b)).join('')}</section>` : '';

  const myBar = state.mine ? `<button type="button" class="row" data-act="go" data-to="panel"><span class="thumb" aria-hidden="true">🏪</span><span class="to"><strong>${t('Tu bar')}: ${esc(state.barById.get(state.mine.bar)?.nombre ?? state.mine.nombre ?? '')}</strong><small>${t('Sube la tapa de hoy y mira tus votos')}</small></span><span class="go" aria-hidden="true">›</span></button>` : '';

  const promo = state.mine ? '' : `<section class="promo"><span class="big-emoji" aria-hidden="true">🍷</span><h2>${t('¿Tienes un bar?')}</h2><p>${t('Pon tu tapa del día en el mapa: una foto y listo. Gratis, sin apps ni cuentas.')}</p>
    <button type="button" class="cta" data-act="go" data-to="alta">${t('Quiero salir en el mapa')}</button></section>`;

  const lastDays = older.length && today.length < 6 ? `<section><h2 class="section-title">${t('Estos días')}<small>${t('para hacerse una idea')}</small></h2></section><div class="reel">${older.slice(0, 12).map(card).join('')}</div>` : '';

  const offline = state.offline ? `<p class="demo-banner"><span aria-hidden="true">📡</span><span>${t('Sin conexión: enseñamos lo último que se guardó en este móvil.')}</span></p>` : '';

  return `${title}${demoBanner()}${offline}${myBar}${main}${podium}${near}${favs}${lastDays}${promo}
    <ul class="tips"><li><span aria-hidden="true">🔥</span>${t('Pulsa «¡Que tapa!» en las que te gusten: las más votadas brillan en el mapa.')}</li>
    <li><span aria-hidden="true">⭐</span>${t('Guarda tus bares con la estrella y los verás aquí al abrir.')}</li></ul>
    ${langSwitch()}${foot()}`;
}

/* ---------- Ficha del bar ---------- */
function barHTML() {
  const bar = state.barById.get(state.barId) ?? state.bar?.bar;
  if (!bar) return `<div class="head">${back()}<div><h1>${state.loaded ? t('Este bar ya no está en el mapa') : t('Cargando…')}</h1></div></div>`;
  const history = (state.bar?.bar?.id === bar.id ? state.bar.tapas : state.tapas.filter((x) => x.bar === bar.id)).slice().sort((a, b) => b.at.localeCompare(a.at));
  const tapa = history.find((x) => x.id === state.tapaId) ?? history[0] ?? null;
  const fav = state.favs.includes(bar.id);
  const owner = state.mine?.bar === bar.id;

  const headHTML = `<div class="head">${back()}<div><h1>${esc(bar.nombre)}</h1><small>${bar.reg ? `✔ ${t('El bar sube sus tapas')}` : esc(bar.dir || t('Bar de Lugo'))}</small></div>
    <button type="button" class="icon-btn${fav ? ' on' : ''}" data-act="fav" aria-pressed="${fav}" aria-label="${fav ? t('Quitar de tus bares') : t('Guardar en tus bares')}" title="${fav ? t('Quitar de tus bares') : t('Guardar en tus bares')}">${fav ? STAR : STAR_OFF}</button>
    <button type="button" class="icon-btn" data-act="share" aria-label="${t('Compartir')}" title="${t('Compartir')}">${SHARE}</button></div>`;

  let body;
  if (tapa) {
    const voted = Boolean(state.fuegos[tapa.id]);
    const tags = [
      isToday(tapa) ? `<span class="tag today">${t('Hoy')} · ${esc(ago(tapa))}</span>` : `<span class="tag">${esc(ago(tapa))}</span>`,
      tapa.autor === 'bar' ? `<span class="tag verified">✔ ${t('Foto del bar')}</span>` : `<span class="tag">📸 ${t('Foto de un cliente')}</span>`,
    ].join('');
    body = `<div class="hero"><img src="${esc(src(tapa))}" alt="${esc(tapa.nombre)}"><div class="tags">${tags}</div></div>
      <h2 class="tapa-name">${esc(tapa.nombre)}</h2>
      ${tapa.tipos?.length ? `<div class="tipos">${tapa.tipos.filter((k) => TIPOS[k]).map((k) => `<span class="tipo">${tipoLabel(k)}</span>`).join('')}</div>` : ''}
      ${tapa.nota ? `<p class="nota">${esc(tapa.nota)}</p>` : ''}
      ${isToday(tapa) ? `<button type="button" class="fuego${voted ? ' done' : ''}" data-act="fuego" data-tapa="${esc(tapa.id)}">${voted ? `🔥 ${t('¡Votada!')}` : `🔥 ${t('¡Que tapa!')}`}<span class="count">${tapa.fuegos}</span></button>`
        : `<p class="note">${t('Esta es la última que vimos. ¿Vas hoy? Sube la de hoy y aparecerá aquí.')}</p>`}`;
  } else {
    body = `<div class="hero none"><div><span aria-hidden="true">🍢</span><strong>${t('Aún no sabemos qué tapa ponen')}</strong><p>${t('Si estás allí, hazle una foto y sé el primero.')}</p></div></div>`;
  }

  const actions = `<div class="buttons">
    <button type="button" class="cta ${tapa && isToday(tapa) ? 'second' : 'fire'}" data-act="upload" data-bar="${esc(bar.id)}">📸 ${owner ? t('Subir la tapa de hoy') : t('Subir la de hoy')}</button>
    <a class="cta second" href="https://www.google.com/maps/dir/?api=1&amp;destination=${bar.lat},${bar.lon}" target="_blank" rel="noopener">${PIN_ICON}${t('Cómo llegar')}</a></div>
    ${bar.dir ? `<p class="addr">${PIN_ICON}<span>${esc(bar.dir)}${state.me ? ` · ${distanceText(distance(state.me, bar))}` : ''}${bar.insta ? ` · <a href="https://instagram.com/${esc(bar.insta)}" target="_blank" rel="noopener">@${esc(bar.insta)}</a>` : ''}</span></p>` : ''}`;

  const grid = history.length > 1 ? `<section class="form"><h2 class="section-title">${t('Otras tapas de aquí')}<small>${plural(history.length, '1 foto', '{n} fotos')}</small></h2>
    <div class="grid">${history.slice(0, 24).map((x) => `<button type="button" data-act="pick-tapa" data-tapa="${esc(x.id)}" aria-current="${x.id === tapa?.id}" aria-label="${esc(x.nombre)}"><img src="${esc(src(x, true))}" alt="" loading="lazy"><small>${esc(isToday(x) ? t('Hoy') : shortDate(x.fecha))}</small></button>`).join('')}</div></section>` : '';

  const claim = !bar.reg && !owner ? `<div class="claim"><span aria-hidden="true">🏪</span><div><strong>${t('¿Es tu bar?')}</strong><p>${t('Sube tú la tapa cada día y sal destacado en el mapa. Gratis.')}</p><button type="button" class="cta second" data-act="go" data-to="alta/${esc(bar.id)}">${t('Dar de alta mi bar')}</button></div></div>` : '';

  return `${headHTML}${demoBanner()}${body}${actions}${grid}${claim}${foot({ bar: bar.id, tapa: tapa?.id ?? '' })}`;
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
    return `<div class="rows">${favBars.length ? `<h2 class="section-title">${t('Tus bares')}</h2>${favBars.map((b) => barRow(b)).join('')}` : ''}
      ${withTapa.length ? `<h2 class="section-title">${t('Con tapa hoy')}</h2>${withTapa.map((b) => barRow(b)).join('')}` : `<p class="note">${t('Escribe el nombre de un bar o de una tapa: raxo, callos, tortilla…')}</p>`}</div>`;
  }
  const words = q.split(/\s+/);
  const match = (s) => { const n = norm(s); return words.every((w) => n.includes(w)); };
  const tapas = state.tapas.filter((x) => match(x.nombre)).sort((a, b) => (isToday(b) - isToday(a)) || b.fuegos - a.fuegos).slice(0, 12);
  const bars = state.bares.filter((b) => match(`${b.nombre} ${b.dir}`)).sort((a, b) => (state.latest.has(b.id) - state.latest.has(a.id)) || a.nombre.localeCompare(b.nombre)).slice(0, 25);
  if (!tapas.length && !bars.length) return `<p class="note">${t('No encontramos nada con «{q}».', { q: esc(state.query.trim()) })}</p>`;
  return `<div class="rows">${tapas.length ? `<h2 class="section-title">${t('Tapas')}</h2>${tapas.map((x) => `<button type="button" class="row" data-act="open-tapa" data-bar="${esc(x.bar)}" data-tapa="${esc(x.id)}"><img class="thumb" src="${esc(src(x, true))}" alt="" loading="lazy"><span class="to"><strong>${esc(x.nombre)}</strong><small>${esc(state.barById.get(x.bar)?.nombre ?? '')} · ${esc(ago(x))}</small></span>${x.fuegos ? `<span class="score">🔥 ${x.fuegos}</span>` : ''}</button>`).join('')}` : ''}
    ${bars.length ? `<h2 class="section-title">${t('Bares')}</h2>${bars.map((b) => barRow(b)).join('')}` : ''}</div>`;
}

/* ---------- Subir una tapa ---------- */
function uploadHTML() {
  const up = state.upload;
  const bar = up.bar ? state.barById.get(up.bar) : null;
  const owner = Boolean(bar && state.mine?.bar === bar.id);
  const head = `<div class="head">${back()}<div><h1>${owner ? t('La tapa de hoy') : t('Sube una tapa')}</h1><small>${owner ? t('Sale en el mapa al momento') : t('La foto de lo que te pusieron con la consumición')}</small></div></div>`;

  if (up.done) {
    return `${head}<div class="ok-box"><span class="big" aria-hidden="true">${owner ? '🔥' : '🙌'}</span><strong>${owner ? t('¡Ya está en el mapa!') : t('¡Gracias!')}</strong>
      <p>${owner ? t('Comparte el enlace de tu bar en tus redes para que la vean.') : t('La miramos en un momento y sale en el mapa. Así nadie sube cosas raras.')}</p></div>
      <div class="buttons">${owner ? `<button type="button" class="cta fire" data-act="share-bar" data-bar="${esc(bar.id)}">${SHARE}${t('Compartir mi bar')}</button>` : ''}
      <button type="button" class="cta second" data-act="go" data-to="${owner ? 'panel' : ''}">${owner ? t('Volver a tu bar') : t('Volver al mapa')}</button></div>`;
  }

  if (!bar) {
    const q = norm(up.q ?? '');
    let list = state.bares;
    if (q) list = list.filter((b) => norm(`${b.nombre} ${b.dir}`).includes(q));
    if (state.me) list = [...list].sort((a, b) => distance(state.me, a) - distance(state.me, b));
    else if (!q) list = [...list].sort((a, b) => (state.latest.has(b.id) - state.latest.has(a.id)) || a.nombre.localeCompare(b.nombre));
    list = list.slice(0, 20);
    return `${head}<div class="form"><h2 class="section-title">${t('¿En qué bar estás?')}</h2>
      ${state.me ? '' : `<button type="button" class="cta fire" data-act="locate">📍 ${t('Buscar los bares de aquí al lado')}</button>`}
      <label class="field"><span>${t('O búscalo por el nombre')}</span><input id="up-q" type="search" value="${esc(up.q ?? '')}" placeholder="${t('Nombre del bar')}" autocomplete="off"></label>
      <div class="rows">${list.map((b) => `<button type="button" class="row" data-act="up-bar" data-bar="${esc(b.id)}"><span class="thumb" aria-hidden="true">${state.latest.has(b.id) ? '🍢' : '🍷'}</span><span class="to"><strong>${esc(b.nombre)}</strong><small>${esc(b.dir || '')}${state.me ? `${b.dir ? ' · ' : ''}${distanceText(distance(state.me, b))}` : ''}</small></span><span class="go" aria-hidden="true">›</span></button>`).join('') || `<p class="note">${t('No aparece. Si es tu bar, puedes darlo de alta.')}</p>`}</div>
      <button type="button" class="cta second" data-act="go" data-to="alta">${t('Mi bar no está en la lista')}</button></div>`;
  }

  const picked = `<div class="picked"><span aria-hidden="true">📍</span><div><strong>${esc(bar.nombre)}</strong><small>${esc(bar.dir || t('Lugo'))}</small></div>${owner ? '' : `<button type="button" data-act="up-change">${t('Cambiar')}</button>`}</div>`;
  const photo = up.photo
    ? `<div class="preview"><img src="${esc(up.photo.url)}" alt=""><button type="button" data-act="pick-gallery">${t('Cambiar la foto')}</button></div>`
    : `<div class="picker"><button type="button" class="main" data-act="pick-camera"><span aria-hidden="true">📸</span>${t('Hacer la foto')}</button><button type="button" data-act="pick-gallery"><span aria-hidden="true">🖼️</span>${t('Elegir de la galería')}</button></div>
      ${up.processing ? `<p class="note">${t('Preparando la foto…')}</p>` : ''}`;
  const tipos = Object.keys(TIPOS).map((k) => `<button type="button" class="chip" data-act="up-tipo" data-tipo="${k}" aria-pressed="${up.tipos.includes(k)}">${tipoLabel(k)}</button>`).join('');
  const ready = up.photo && up.nombre.trim().length >= 2 && !up.sending;
  return `${head}${demoBanner()}<div class="form">${picked}${photo}
    <label class="field"><span>${t('¿Qué tapa es?')}</span><input id="up-nombre" value="${esc(up.nombre)}" maxlength="60" placeholder="${t('Raxo con patatas, callos, tortilla…')}" autocomplete="off" enterkeyhint="done"></label>
    <div class="ideas">${IDEAS.map((x) => `<button type="button" data-act="up-idea" data-idea="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="field"><span>${t('¿De qué es? (opcional)')}</span><div class="toggles">${tipos}</div></div>
    ${owner ? `<label class="field"><span>${t('Una nota (opcional)')}</span><input id="up-nota" value="${esc(up.nota)}" maxlength="80" placeholder="${t('Hasta las 15:00 · Solo con vino')}" autocomplete="off"><small>${t('Sale debajo de la foto.')}</small></label>` : ''}
    <label class="trap" aria-hidden="true">Web <input id="up-web" tabindex="-1" autocomplete="off"></label>
    <button type="button" class="cta fire" data-act="up-send" ${ready ? '' : 'disabled'}>${up.sending ? t('Subiendo…') : owner ? `🔥 ${t('Publicar ya')}` : `🚀 ${t('Enviar')}`}</button>
    <p class="note">${owner ? t('Solo tú tienes este enlace: lo que subas sale con la marca «Foto del bar».') : t('Antes de salir la revisamos. No necesitas cuenta y no guardamos quién eres; la foto se envía sin la ubicación ni los datos del móvil.')}</p></div>`;
}

/* ---------- Alta de un bar ---------- */
function altaHTML() {
  const a = state.alta;
  const head = `<div class="head">${back()}<div><h1>${t('Pon tu bar en el mapa')}</h1><small>${t('Gratis, sin apps ni cuentas')}</small></div></div>`;
  if (a.sent) {
    return `${head}<div class="ok-box"><span class="big" aria-hidden="true">🎉</span><strong>${t('¡Recibido!')}</strong><p>${t('Te mandamos el enlace privado de tu bar en cuanto lo revisemos, normalmente el mismo día.')}</p></div>
      <button type="button" class="cta second" data-act="go" data-to="">${t('Volver al mapa')}</button>`;
  }
  if (a.aiming) {
    return `<div class="head"><div><h1>${t('¿Dónde está tu bar?')}</h1><small>${t('Mueve el mapa hasta que la chincheta quede encima.')}</small></div></div>
      <div class="buttons"><button type="button" class="cta fire" data-act="aim-ok">${t('Es aquí')}</button><button type="button" class="cta second" data-act="aim-cancel">${t('Cancelar')}</button></div>`;
  }
  const located = Number.isFinite(a.lat);
  const where = a.osm
    ? `<div class="picked"><span aria-hidden="true">📍</span><div><strong>${esc(a.nombre)}</strong><small>${t('Ya está en el mapa: usamos su sitio.')}</small></div></div>`
    : `<div class="field"><span>${t('¿Dónde está?')}</span>${located ? `<div class="picked"><span aria-hidden="true">✅</span><div><strong>${t('Sitio marcado')}</strong><small>${a.lat.toFixed(5)}, ${a.lon.toFixed(5)}</small></div><button type="button" data-act="aim">${t('Cambiar')}</button></div>`
      : `<div class="buttons"><button type="button" class="cta second" data-act="alta-here">📍 ${t('Estoy en el bar')}</button><button type="button" class="cta second" data-act="aim">🗺️ ${t('Lo marco en el mapa')}</button></div>`}</div>`;
  const ready = a.nombre.trim().length >= 2 && a.contacto.trim().length >= 5 && located && !a.sending;
  return `${head}${demoBanner()}<ul class="perks">
      <li><span aria-hidden="true">📸</span>${t('Subes tu tapa del día en 20 segundos desde el móvil del bar.')}</li>
      <li><span aria-hidden="true">🔥</span>${t('La gente la vota y las mejores brillan en el mapa.')}</li>
      <li><span aria-hidden="true">✔</span>${t('Tu bar sale destacado y tus fotos llevan la marca «Foto del bar».')}</li></ul>
    <div class="form">
    ${a.osm ? where : `<label class="field"><span>${t('Nombre del bar')}</span><input id="al-nombre" value="${esc(a.nombre)}" maxlength="60" autocomplete="organization"></label>
      <label class="field"><span>${t('Dirección')}</span><input id="al-dir" value="${esc(a.dir)}" maxlength="100" placeholder="${t('Rúa Nova, 12')}" autocomplete="street-address"></label>${where}`}
    <label class="field"><span>${t('Teléfono o email')}</span><input id="al-contacto" value="${esc(a.contacto)}" maxlength="120" inputmode="email" autocomplete="tel"><small>${t('Solo para mandarte el enlace de tu bar. No sale en ningún sitio.')}</small></label>
    <label class="field"><span>${t('Instagram del bar (opcional)')}</span><input id="al-insta" value="${esc(a.insta)}" maxlength="40" placeholder="@tubar" autocomplete="off"></label>
    <label class="field"><span>${t('¿Algo más? (opcional)')}</span><textarea id="al-mensaje" maxlength="400">${esc(a.mensaje)}</textarea></label>
    <label class="trap" aria-hidden="true">Web <input id="al-web" tabindex="-1" autocomplete="off"></label>
    <button type="button" class="cta fire" data-act="alta-send" ${ready ? '' : 'disabled'}>${a.sending ? t('Enviando…') : t('Quiero mi enlace')}</button></div>
    ${foot()}`;
}

/* ---------- Panel del bar ---------- */
function panelHTML() {
  const head = (title, sub) => `<div class="head">${back()}<div><h1>${title}</h1>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  if (!state.mine) return `${head(t('Tu bar'))}<p class="note">${t('Abre el enlace privado que te mandamos para entrar en el panel de tu bar.')}</p><button type="button" class="cta fire" data-act="go" data-to="alta">${t('Pedir mi enlace')}</button>`;
  const p = state.panel;
  if (!p) return `${head(t('Tu bar'))}<p class="note">${t('Cargando…')}</p>`;
  if (p.error) {
    return `${head(t('Tu bar'))}<div class="empty"><span class="plate" aria-hidden="true">🔒</span><strong>${t('Este enlace ya no vale')}</strong><p>${esc(p.error)}. ${t('Pídenos uno nuevo y te lo mandamos.')}</p></div>
      <button type="button" class="cta second" data-act="logout">${t('Olvidar este enlace en el móvil')}</button>`;
  }
  const today = p.tapas.filter((x) => x.fecha === p.fecha);
  const install = state.installPrompt ? `<button type="button" class="cta second" data-act="install">📲 ${t('Añadir a la pantalla de inicio')}</button>`
    : `<p class="note">📲 ${/iP(hone|ad|od)/.test(navigator.userAgent) ? t('Guárdalo en la pantalla de inicio: botón Compartir › «Añadir a pantalla de inicio».') : t('Guárdalo en la pantalla de inicio desde el menú del navegador.')}</p>`;
  return `${head(esc(p.bar.nombre), `✔ ${t('Panel de tu bar')}`)}
    <button type="button" class="cta fire" data-act="upload" data-bar="${esc(p.bar.id)}" style="min-height:64px;font-size:19px">📸 ${today.length ? t('Subir otra tapa') : t('Subir la tapa de hoy')}</button>
    <div class="stats"><div class="stat hot"><b>🔥 ${p.hoy.fuegos}</b><small>${t('votos hoy')}</small></div><div class="stat"><b>${p.total.tapas}</b><small>${t('tapas subidas')}</small></div></div>
    ${today.length ? `<section class="form"><h2 class="section-title">${t('Hoy')}</h2>${today.map((x) => `<div class="mine"><img src="${esc(src(x, true))}" alt=""><div><strong>${esc(x.nombre)}</strong><small>${esc(ago(x))} · 🔥 ${x.fuegos}</small></div>
      ${x.autor === 'bar' ? `<button type="button" data-act="del-tapa" data-tapa="${esc(x.id)}">${state.confirmDelete === x.id ? t('¿Seguro? Borrar') : t('Borrar')}</button>` : ''}</div>`).join('')}</section>` : `<p class="note">${t('Hoy todavía no subiste ninguna. Los primeros del día salen arriba del todo.')}</p>`}
    <section class="form"><h2 class="section-title">${t('Que te encuentren')}</h2>
      <button type="button" class="cta second" data-act="share-bar" data-bar="${esc(p.bar.id)}">${SHARE}${t('Compartir el enlace de tu bar')}</button>
      <p class="note">${t('Ponlo en tu Instagram o en un cartel con QR en la barra: «Mira aquí nuestra tapa de hoy».')}</p>${install}</section>
    <ul class="tips"><li><span aria-hidden="true">🔒</span>${t('Este panel es solo para tu bar: no compartas el enlace privado.')}</li></ul>
    <button type="button" class="cta second" data-act="logout">${t('Salir del panel en este móvil')}</button>${foot({ bar: p.bar.id })}`;
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
  if (r.sent) return `${head}<div class="ok-box"><span class="big" aria-hidden="true">💌</span><strong>${t('¡Gracias!')}</strong><p>${t('Lo miramos lo antes posible.')}</p></div><button type="button" class="cta second" data-act="back">${t('Volver')}</button>`;
  const kinds = Object.entries(REPORT_KINDS).filter(([k]) => bar || k === 'otro').map(([k, label]) => `<label><input type="radio" name="rep-tipo" value="${k}" ${r.tipo === k ? 'checked' : ''}>${t(label)}</label>`).join('');
  return `${head}<div class="form"><div class="radios">${kinds}</div>
    <label class="field"><span>${t('Cuéntanos (opcional)')}</span><textarea id="rep-texto" maxlength="1000">${esc(r.texto)}</textarea></label>
    <label class="field"><span>${t('Tu contacto, si quieres respuesta (opcional)')}</span><input id="rep-contacto" value="${esc(r.contacto)}" maxlength="120" autocomplete="email"></label>
    <label class="trap" aria-hidden="true">Web <input id="rep-web" tabindex="-1" autocomplete="off"></label>
    <button type="button" class="cta fire" data-act="rep-send" ${r.sending ? 'disabled' : ''}>${r.sending ? t('Enviando…') : t('Enviar')}</button>
    <p class="note">${t('No guardamos tu IP ni nada del móvil: solo lo que escribes.')}</p></div>`;
}

/* ---------- Pintar ---------- */
const TALL = ['search', 'upload', 'alta', 'panel', 'report'];
function render() {
  const view = state.view;
  document.body.dataset.view = view;
  const html = view === 'bar' ? barHTML()
    : view === 'search' ? searchHTML()
      : view === 'upload' ? uploadHTML()
        : view === 'alta' ? altaHTML()
          : view === 'panel' ? panelHTML()
            : view === 'report' ? reportHTML()
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
  if (name === 'bar' && a) {
    if (state.barId !== a) { state.bar = null; state.tapaId = null; }
    if (state.pendingTapa) { state.tapaId = state.pendingTapa; state.pendingTapa = null; }
    state.barId = a;
    setView('bar');
    const bar = state.barById.get(a);
    if (bar) flyTo(bar.lon, bar.lat);
    loadBar(a).then(() => {
      if (state.view === 'bar' && state.barId === a) {
        render();
        const known = state.barById.get(a);
        if (!bar && known) flyTo(known.lon, known.lat);
      }
    });
    return;
  }
  if (name === 'subir') {
    const barId = a && state.barById.has(a) ? a : null;
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

async function loadPanel() {
  if (!state.mine) { render(); return; }
  if (DEMO) {
    const bar = state.barById.get(state.mine.bar) ?? state.bares[0];
    const mine = state.tapas.filter((x) => x.bar === bar.id);
    state.panel = { fecha: state.fecha, bar, tapas: mine, hoy: { tapas: mine.filter(isToday).length, fuegos: mine.filter(isToday).reduce((s, x) => s + x.fuegos, 0) }, total: { tapas: mine.length, fuegos: 0 } };
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

/* ---------- «¡Que tapa!» ---------- */
function burst(from) {
  if (reduced) return;
  const box = from.getBoundingClientRect();
  const icons = ['🔥', '🔥', '🔥', '🍷', '✨', '🔥'];
  for (let i = 0; i < 12; i += 1) {
    const s = document.createElement('span');
    s.className = 'burst';
    s.textContent = icons[i % icons.length];
    const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
    const dist = 70 + Math.random() * 70;
    s.style.left = `${box.left + box.width / 2 - 13}px`;
    s.style.top = `${box.top + box.height / 2 - 13}px`;
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
    s.style.setProperty('--r', `${Math.round(Math.random() * 80 - 40)}deg`);
    document.body.append(s);
    setTimeout(() => s.remove(), 1000);
  }
  navigator.vibrate?.(30);
}

async function fuego(id, button) {
  const tapa = state.tapas.find((x) => x.id === id) ?? state.bar?.tapas.find((x) => x.id === id);
  if (!tapa || state.fuegos[id]) return;
  burst(button);
  state.fuegos[id] = tapa.fecha;
  store.set('quetapa-fuegos', state.fuegos);
  const all = [state.tapas.find((x) => x.id === id), state.bar?.tapas.find((x) => x.id === id)].filter(Boolean);
  for (const x of new Set(all)) x.fuegos += 1;
  render();
  if (DEMO) return;
  try {
    const { fuegos } = await postJSON('/fuego', { tapa: id });
    for (const x of new Set(all)) x.fuegos = fuegos;
    render();
  } catch { /* se queda como está */ }
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
  const url = `${location.origin}/#bar/${encodeURIComponent(id)}`;
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
        go(`bar/${d.bar}`);
        break;
      case 'pick-tapa': state.tapaId = d.tapa; render(); $('#sheet-body').scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); break;
      case 'filter': state.filter = d.filter; render(); break;
      case 'fuego': fuego(d.tapa, el); break;
      case 'fav': {
        const id = state.barId;
        state.favs = state.favs.includes(id) ? state.favs.filter((x) => x !== id) : [id, ...state.favs].slice(0, 30);
        store.set('quetapa-favs', state.favs);
        toast(state.favs.includes(id) ? t('Guardado en tus bares ⭐') : t('Quitado de tus bares'));
        render();
        break;
      }
      case 'share': shareBar(state.barId); break;
      case 'share-bar': shareBar(d.bar); break;
      case 'upload': go(d.bar ? `subir/${d.bar}` : 'subir'); break;
      case 'locate': locate(); break;
      case 'up-bar': state.upload.bar = d.bar; history.replaceState(null, '', `#subir/${d.bar}`); render(); body.scrollTop = 0; break;
      case 'up-change': state.upload.bar = null; history.replaceState(null, '', '#subir'); render(); break;
      case 'pick-camera': $('#file-camera').click(); break;
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
  $('#snap').addEventListener('click', () => go(state.view === 'bar' && state.barId ? `subir/${state.barId}` : 'subir'));
  $('#locate').addEventListener('click', locate);
  $('#zoom-in').addEventListener('click', () => map?.zoomIn());
  $('#zoom-out').addEventListener('click', () => map?.zoomOut());
  $('#credit').addEventListener('click', () => toast(t('Mapa: OpenFreeMap © OpenMapTiles. Bares: © colaboradores de OpenStreetMap.'), 5000));
  for (const id of ['#file-camera', '#file-gallery']) {
    $(id).addEventListener('change', (e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f); });
  }
  const q = $('#q');
  q.addEventListener('focus', () => { if (state.view !== 'search') { state.query = q.value; setView('search', 'tall'); } });
  q.addEventListener('input', () => { state.query = q.value; render(); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });
  q.addEventListener('search', () => { if (!q.value) { state.query = ''; render(); } });
  $('.brand').addEventListener('click', (e) => { e.preventDefault(); go(''); });
  window.addEventListener('hashchange', () => { q.value = ''; state.query = ''; route(); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; if (state.view === 'panel') render(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadToday({ quiet: true }); });
  setInterval(() => { if (document.visibilityState === 'visible') loadToday({ quiet: true }); }, 120000);
  if (!sessionStorage.getItem('quetapa-hola')) { $('#snap').classList.add('hello'); try { sessionStorage.setItem('quetapa-hola', '1'); } catch { /* nada */ } }

  route();
  initMap();
  loadToday().then(() => {
    if (!['home', 'search'].includes(state.view)) route();
    setTimeout(recenter, 120);
  });
  if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
