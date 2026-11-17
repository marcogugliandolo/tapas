// Que Tapa!: el modo de ejemplo (/?ejemplo), para enseñar la web llena antes de que los bares
// suban nada. Usa bares de Lugo con tapas que se conocen por artículos publicados (Guía Repsol,
// Planomato), pero las «fotos» son dibujos y las notas y las horas, inventadas. La web lo avisa
// arriba y las tapas llevan la marca «Ejemplo»: nada de esto lo ha subido ningún bar.
//
// Si el servidor tiene los bares de OpenStreetMap, cada uno sale en su sitio exacto; si no,
// en una posición aproximada.

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

// Bares con tapas conocidas. `busca` encuentra el bar en OpenStreetMap; `lat`/`lon` son la posición
// aproximada por si no aparece.
const BARES = [
  { id: 'daniel', nombre: 'Taberna Daniel', dir: 'Zona de viños', busca: /\b(taberna )?daniel\b/, lat: 43.00975, lon: -7.55855 },
  { id: 'cinco-vigas', nombre: 'Las Cinco Vigas', dir: 'Rúa da Cruz', busca: /\b(cinco|5) vigas\b/, lat: 43.0096, lon: -7.5588 },
  { id: 'catro-ruas', nombre: '4 Rúas', dir: 'A Milagrosa', busca: /\b(4|catro|cuatro) ruas\b/, lat: 43.0185, lon: -7.547 },
  { id: 'la-nuez', nombre: 'La Nuez', dir: 'Rúa do Camiño Real, 117', busca: /\bnuez\b/, lat: 43.0172, lon: -7.5452 },
  { id: 'lagar', nombre: 'Cervecería Lagar', dir: 'Rúa da Milagrosa, 38', busca: /\blagar\b/, lat: 43.018, lon: -7.5463 },
  { id: 'a-adega', nombre: 'A Adega', dir: 'Praza do Campo, 4', busca: /^(a )?adega$/, lat: 43.0103, lon: -7.55775 },
  { id: 'paprica', nombre: 'Paprica', dir: 'Lugo', busca: /\bpaprica\b/, lat: 43.01155, lon: -7.559 },
];

// [bar, tapa, tipos, dibujo, número de notas, media, hace cuántos minutos, días atrás]
const TAPAS = [
  ['daniel', 'Huevo frito', ['huevo'], '🍳', 31, 4.7, 35, 0],
  ['cinco-vigas', 'Chorizo a la sidra', ['carne'], '🥘', 23, 4.5, 70, 0],
  ['catro-ruas', 'Pulpo á feira', ['mar', 'sin-gluten'], '🐙', 18, 4.8, 125, 0],
  ['la-nuez', 'Raxo', ['carne'], '🥩', 15, 4.4, 20, 0],
  ['lagar', 'Costilla', ['carne'], '🍖', 12, 4.6, 160, 0],
  ['a-adega', 'Caldo gallego', ['cuchara'], '🍲', 9, 4.2, 200, 0],
  ['paprica', 'Berenjena escalibada con queso de cabra', ['veggie'], '🍆', 6, 4.9, 50, 0],
  ['catro-ruas', 'Churrasco', ['carne'], '🍖', 4, 4.0, 15, 0],
  ['daniel', 'Cocodrilo: filete con patatas', ['carne'], '🍟', 19, 4.3, 1500, 1],
  ['la-nuez', 'Tortilla rellena', ['huevo'], '🥚', 14, 4.6, 1600, 1],
  ['cinco-vigas', 'Lengua en salsa', ['carne'], '🥘', 8, 4.1, 3000, 2],
];

const madridDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

/** Los datos de ejemplo. `reales` son los bares que manda el servidor (pueden no venir). */
export function demoData(reales = []) {
  const now = Date.now();
  const fecha = madridDay(now - 5 * 3600000);
  const dayBefore = (n) => madridDay(now - 5 * 3600000 - n * 86400000);
  const usados = new Set();
  const idDe = new Map();
  const bares = BARES.map((b) => {
    const real = reales.find((r) => !usados.has(r.id) && b.busca.test(norm(r.nombre)));
    if (real) {
      usados.add(real.id);
      idDe.set(b.id, real.id);
      return { ...real, reg: false };
    }
    idDe.set(b.id, `ejemplo-${b.id}`);
    return { id: `ejemplo-${b.id}`, nombre: b.nombre, lat: b.lat, lon: b.lon, dir: b.dir, reg: false };
  });
  const tapas = TAPAS.map(([bar, nombre, tipos, emoji, votos, media, ago, dias], i) => ({
    id: `ejemplo-t${i + 1}`, bar: idDe.get(bar), fecha: dias ? dayBefore(dias) : fecha, at: new Date(now - ago * 60000).toISOString(),
    nombre, tipos, nota: '', autor: 'ejemplo', votos, media, img: dibujo(emoji, i), mini: dibujo(emoji, i, true),
  }));
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
