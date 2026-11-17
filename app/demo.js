// Que Tapa!: el modo de ejemplo (/?ejemplo), para enseñar la web llena antes de que los bares
// suban nada. Salen bares de Lugo: unos con tapas que se conocen por artículos publicados (Guía
// Repsol, Planomato) y otros con tapas típicas puestas de ejemplo. Las «fotos» son dibujos y las
// notas y las horas, inventadas. La web lo avisa arriba y cada tapa lleva la marca «Ejemplo».
//
// Si el servidor tiene los bares de OpenStreetMap, cada uno sale en su sitio exacto y además se
// rellenan otros bares de verdad del centro y de A Milagrosa; si no, salen en una posición aproximada.

const FONDOS = ['#F3E6D8', '#E8EEF0', '#F1E4E1', '#E9EFE3', '#F4EBD6', '#ECE7F1'];

/** Un dibujo sencillo de la tapa en su plato. */
function dibujo(emoji, fondo, square = false) {
  const color = FONDOS[fondo % FONDOS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${square ? '75 0 450 450' : '0 0 600 450'}">
<rect x="0" y="0" width="600" height="450" fill="${color}"/>
<circle cx="306" cy="234" r="150" fill="#000" fill-opacity=".06"/>
<circle cx="300" cy="225" r="150" fill="#FFFFFF"/>
<circle cx="300" cy="225" r="112" fill="none" stroke="#000" stroke-opacity=".05" stroke-width="4"/>
<text x="300" y="284" font-size="150" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Bares de Lugo con su tapa: `tapas` va de hoy hacia atrás (la primera es la de hoy). `busca`
// encuentra el bar en OpenStreetMap; `lat`/`lon` son la posición aproximada por si no aparece.
const BARES = [
  { id: 'daniel', nombre: 'Taberna Daniel', dir: 'Zona de viños', busca: /\b(taberna )?daniel\b/, lat: 43.00975, lon: -7.55855,
    tapas: [['Huevo frito', ['huevo'], '🍳'], ['Cocodrilo: filete con patatas', ['carne'], '🍟'], ['Pincho moruno', ['carne'], '🍢'], ['Costilla guisada', ['carne', 'cuchara'], '🍖']] },
  { id: 'cinco-vigas', nombre: 'Las Cinco Vigas', dir: 'Rúa da Cruz', busca: /\b(cinco|5) vigas\b/, lat: 43.0096, lon: -7.5588,
    tapas: [['Chorizo a la sidra', ['carne'], '🥘'], ['Lengua en salsa', ['carne'], '🥘'], ['Champiñones a la crema', ['veggie'], '🍄']] },
  { id: 'catro-ruas', nombre: '4 Rúas', dir: 'A Milagrosa', busca: /\b(4|catro|cuatro) ruas\b/, lat: 43.0185, lon: -7.547,
    tapas: [['Pulpo á feira', ['mar', 'sin-gluten'], '🐙'], ['Churrasco', ['carne'], '🍖'], ['Morro en salsa', ['carne'], '🥘']] },
  { id: 'la-nuez', nombre: 'La Nuez', dir: 'Rúa do Camiño Real, 117', busca: /\bnuez\b/, lat: 43.0172, lon: -7.5452,
    tapas: [['Raxo', ['carne'], '🥩'], ['Tortilla rellena', ['huevo'], '🥚'], ['Tosta de lomo', ['carne'], '🥖']] },
  { id: 'lagar', nombre: 'Cervecería Lagar', dir: 'Rúa da Milagrosa, 38', busca: /\blagar\b/, lat: 43.018, lon: -7.5463,
    tapas: [['Costilla', ['carne'], '🍖'], ['Manitas de cerdo', ['carne'], '🥘'], ['Mini hamburguesa', ['carne'], '🍔']] },
  { id: 'a-adega', nombre: 'A Adega', dir: 'Praza do Campo, 4', busca: /^(a )?adega$/, lat: 43.0103, lon: -7.55775,
    tapas: [['Caldo gallego', ['cuchara'], '🍲'], ['Empanada de xoubas', ['mar'], '🥟']] },
  { id: 'paprica', nombre: 'Paprica', dir: 'Lugo', busca: /\bpaprica\b/, lat: 43.01155, lon: -7.559,
    tapas: [['Berenjena escalibada con queso de cabra', ['veggie'], '🍆'], ['Tosta de queso de cabra', ['veggie'], '🧀']] },
  { id: 'milano', nombre: 'Milano', dir: 'A Milagrosa', busca: /\bmilano\b/, lat: 43.0183, lon: -7.5456,
    tapas: [['Liscos con patatas', ['carne'], '🥓'], ['Raxo con pimientos', ['carne'], '🥩']] },
  { id: 'la-base', nombre: 'La Base', dir: 'A Milagrosa', busca: /^((bar|cafe|cafeteria) )?la base$/, lat: 43.0177, lon: -7.5471,
    tapas: [['Garbanzos con bacalao', ['cuchara', 'mar'], '🍲'], ['Morro', ['carne'], '🥘']] },
  { id: 'xarra', nombre: 'A Xarra', dir: 'Praza da Liberdade, 18', busca: /\bxarra\b/, lat: 43.0091, lon: -7.5566,
    tapas: [['Chipirones', ['mar'], '🦑'], ['Falafel', ['veggie'], '🧆']] },
  { id: 'dos-pena', nombre: 'A Taberna dos Peña', dir: 'Lugo', busca: /\bdos pena\b/, lat: 43.0108, lon: -7.5596,
    tapas: [['Callos', ['cuchara', 'carne'], '🍲']] },
  { id: 'boni', nombre: 'El Boni', dir: 'Rúa Portugal, 57', busca: /\bboni\b/, lat: 43.0058, lon: -7.5552,
    tapas: [['Croqueta de lacón', ['carne'], '🧆'], ['Tataki de atún', ['mar'], '🐟']] },
  { id: 'desnivel', nombre: 'Desnivel', dir: 'Rúa Nova', busca: /\bdesnivel\b/, lat: 43.0116, lon: -7.5573,
    tapas: [['Huevos rotos', ['huevo'], '🍳']] },
  { id: 'cota', nombre: 'Bar Cotá', dir: 'Praza da Soidade', busca: /\bcota\b/, lat: 43.0125, lon: -7.5541,
    tapas: [['Mejillones en escabeche', ['mar', 'sin-gluten'], '🦪']] },
  { id: 'meson-rua', nombre: 'Mesón da Rúa', dir: 'Lugo', busca: /\bmeson da rua\b/, lat: 43.0087, lon: -7.5592,
    tapas: [['Oreja á feira', ['carne', 'sin-gluten'], '🥘']] },
];

// Tapas típicas para rellenar otros bares de verdad que haya en el mapa.
const TIPICAS = [
  ['Zorza con patatas', ['carne'], '🥓'], ['Pimientos de Padrón', ['veggie', 'sin-gluten'], '🫑'], ['Calamares', ['mar'], '🦑'],
  ['Tortilla de patata', ['huevo', 'veggie'], '🥚'], ['Lacón con cachelos', ['carne', 'sin-gluten'], '🍖'], ['Patatas bravas', ['veggie'], '🥔'],
  ['Queso de Arzúa con membrillo', ['veggie', 'sin-gluten'], '🧀'], ['Gambas al ajillo', ['mar', 'sin-gluten'], '🍤'], ['Lentejas', ['cuchara'], '🍲'],
  ['Albóndigas en salsa', ['carne'], '🥘'], ['Ensaladilla', ['mar'], '🥗'], ['Sardinas', ['mar', 'sin-gluten'], '🐟'],
  ['Montadito de lomo', ['carne'], '🥖'], ['Champiñones al ajillo', ['veggie', 'sin-gluten'], '🍄'], ['Empanada de carne', ['carne'], '🥟'],
];

// Dónde buscar bares para rellenar: la zona de viños y A Milagrosa.
const ZONAS = [{ lat: 43.0099, lon: -7.5575 }, { lat: 43.018, lon: -7.5463 }];
const RELLENO = 14;

const madridDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const metros = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180));
/** Un número «al azar» pero siempre el mismo para la misma posición, para que el ejemplo no baile. */
const azar = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/** Los datos de ejemplo. `reales` son los bares que manda el servidor (pueden no venir). */
export function demoData(reales = []) {
  const now = Date.now();
  const fecha = madridDay(now - 5 * 3600000);
  const dayBefore = (n) => madridDay(now - 5 * 3600000 - n * 86400000);
  const usados = new Set();
  const conTapas = []; // [{ bar, tapas }]

  for (const b of BARES) {
    const real = reales.find((r) => !usados.has(r.id) && b.busca.test(norm(r.nombre)));
    if (real) usados.add(real.id);
    conTapas.push({ bar: real ? { ...real, reg: false } : { id: `ejemplo-${b.id}`, nombre: b.nombre, lat: b.lat, lon: b.lon, dir: b.dir, reg: false }, tapas: b.tapas });
  }

  // Otros bares de verdad cerca de las zonas de tapeo, separados entre sí para que se vean bien.
  const cerca = (r) => Math.min(...ZONAS.map((z) => metros(z, r)));
  const candidatos = reales
    .filter((r) => !usados.has(r.id) && (!r.tipo || r.tipo === 'bar' || r.tipo === 'pub') && cerca(r) < 650)
    .sort((a, b) => cerca(a) - cerca(b));
  const elegidos = [];
  for (const r of candidatos) {
    if (elegidos.length >= RELLENO) break;
    if ([...elegidos, ...conTapas.map((x) => x.bar)].some((o) => metros(o, r) < 45)) continue;
    elegidos.push(r);
  }
  elegidos.forEach((r, i) => {
    usados.add(r.id);
    const hoy = TIPICAS[i % TIPICAS.length];
    const antes = TIPICAS[(i + 5) % TIPICAS.length];
    conTapas.push({ bar: { ...r, reg: false }, tapas: i % 3 === 0 ? [hoy, antes] : [hoy] });
  });

  const tapas = [];
  let n = 0;
  for (const { bar, tapas: lista } of conTapas) {
    lista.forEach(([nombre, tipos, emoji], dias) => {
      n += 1;
      const r = azar(n);
      // Hoy: subida entre hace 10 minutos y hace 4 horas; días atrás, a media mañana.
      const ago = dias ? dias * 1440 + 60 + Math.round(r * 120) : 10 + Math.round(azar(n + 50) * 230);
      tapas.push({
        id: `ejemplo-t${n}`, bar: bar.id, fecha: dias ? dayBefore(dias) : fecha, at: new Date(now - ago * 60000).toISOString(),
        nombre, tipos, nota: '', autor: 'ejemplo',
        votos: 3 + Math.round(r * 34), media: Math.round((3.6 + azar(n + 99) * 1.3) * 10) / 10,
        img: dibujo(emoji, n), mini: dibujo(emoji, n, true),
      });
    });
  }

  const bares = conTapas.map((x) => x.bar);
  // La media de cada bar, juntando sus tapas.
  for (const b of bares) {
    const suyas = tapas.filter((x) => x.bar === b.id);
    const votos = suyas.reduce((s, x) => s + x.votos, 0);
    if (votos) Object.assign(b, { votos, media: Math.round((suyas.reduce((s, x) => s + x.media * x.votos, 0) / votos) * 10) / 10 });
  }
  // El resto de bares de verdad salen como puntos, igual que en la web normal.
  for (const r of reales) if (!usados.has(r.id)) bares.push({ ...r, reg: false });
  return { fecha, bares, tapas };
}
