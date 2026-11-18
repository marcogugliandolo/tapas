// Que Tapa!: las tapas de ejemplo, para enseñar la web llena antes de que los bares suban nada.
// Salen en la portada en los bares que aún no tienen tapa de verdad (la de verdad siempre gana) y
// en /?ejemplo, que es todo de ejemplo y no envía nada. Salen bares de Lugo: unos con tapas que se conocen por artículos publicados (Guía
// Repsol, Planomato) y otros con tapas típicas puestas de ejemplo. Las «fotos» son dibujos y las
// notas y las horas, inventadas. La web lo avisa arriba y cada tapa lleva la marca «Ejemplo».
//
// Si el servidor tiene los bares de OpenStreetMap, cada uno sale en su sitio exacto y además casi
// todos los demás bares de Lugo llevan una tapa típica de ejemplo (siempre la misma para cada bar);
// unos pocos se quedan sin tapa para que se vea cómo queda un bar que aún no la subió.
// Sin el servidor, salen solo los conocidos, en una posición aproximada.

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

// Tapas típicas para el resto de bares.
const TIPICAS = [
  ['Zorza con patatas', ['carne'], '🥓'], ['Pimientos de Padrón', ['veggie', 'sin-gluten'], '🫑'], ['Calamares', ['mar'], '🦑'],
  ['Tortilla de patata', ['huevo', 'veggie'], '🥚'], ['Lacón con cachelos', ['carne', 'sin-gluten'], '🍖'], ['Patatas bravas', ['veggie'], '🥔'],
  ['Queso de Arzúa con membrillo', ['veggie', 'sin-gluten'], '🧀'], ['Gambas al ajillo', ['mar', 'sin-gluten'], '🍤'], ['Lentejas', ['cuchara'], '🍲'],
  ['Albóndigas en salsa', ['carne'], '🥘'], ['Ensaladilla', ['mar'], '🥗'], ['Sardinas', ['mar', 'sin-gluten'], '🐟'],
  ['Montadito de lomo', ['carne'], '🥖'], ['Champiñones al ajillo', ['veggie', 'sin-gluten'], '🍄'], ['Empanada de carne', ['carne'], '🥟'],
  ['Callos', ['cuchara', 'carne'], '🍲'], ['Oreja á feira', ['carne', 'sin-gluten'], '🥘'], ['Raxo', ['carne'], '🥩'],
  ['Pulpo á feira', ['mar', 'sin-gluten'], '🐙'], ['Mejillones en escabeche', ['mar', 'sin-gluten'], '🦪'], ['Tortilla de Betanzos', ['huevo', 'veggie'], '🍳'],
  ['Croquetas de jamón', ['carne'], '🧆'], ['Costilla al horno', ['carne'], '🍖'], ['Chorizo al vino', ['carne'], '🥘'],
  ['Pincho moruno', ['carne'], '🍢'], ['Empanada de zamburiñas', ['mar'], '🥟'], ['Garbanzos con espinacas', ['cuchara', 'veggie'], '🍲'],
  ['Bocadillo de calamares', ['mar'], '🥖'], ['Huevos rotos con chorizo', ['huevo', 'carne'], '🍳'], ['Tosta de pimientos asados', ['veggie'], '🍞'],
  ['Mini hamburguesa', ['carne'], '🍔'], ['Alitas de pollo', ['carne', 'sin-gluten'], '🍗'], ['Caldo gallego', ['cuchara'], '🍲'],
];
// Sitios donde una tapa gallega quedaría rara: pizzerías, japoneses, heladerías…
const NO_TAPAS = /pizz|sushi|kebab|burger|hamburg|\bwok\b|chin[ao]|asia|japon|india|mexic|taco|poke|ramen|thai|helad|pastel|panader|churrer|starbucks|mcdonald|domino|kfc|dunkin|crep|gofre|yogur|\btea\b/;
const SIN_TAPA = 0.1; // la parte de bares que se queda sin tapa

const madridDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
/** Un número «al azar» entre 0 y 1, pero siempre el mismo para el mismo texto: así el ejemplo no baila. */
const azar = (texto) => { let h = 2166136261; for (const c of String(texto)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

/**
 * Los datos con ejemplos. `reales` son los bares que manda el servidor (pueden no venir) y
 * `tapasReales`, sus tapas: los bares que ya tienen alguna se quedan solo con las suyas.
 * `notas` son las que puso esta persona a tapas de ejemplo, que solo cuentan en su móvil.
 */
export function demoData(reales = [], { tapasReales = [], fecha: fechaServidor = '', notas = {} } = {}) {
  const now = Date.now();
  const fecha = fechaServidor || madridDay(now - 5 * 3600000);
  const conReales = new Set(tapasReales.map((x) => x.bar));
  const dayBefore = (n) => madridDay(now - 5 * 3600000 - n * 86400000);
  const usados = new Set();
  const conTapas = []; // [{ bar, tapas }]

  for (const b of BARES) {
    const real = reales.find((r) => !usados.has(r.id) && b.busca.test(norm(r.nombre)) && !NO_TAPAS.test(norm(r.nombre)));
    if (real) usados.add(real.id);
    if (real && conReales.has(real.id)) continue;
    // Sin los bares del servidor, el bar sale en su posición aproximada.
    if (!real && reales.length) continue;
    conTapas.push({ bar: real ? { ...real } : { id: `ejemplo-${b.id}`, nombre: b.nombre, lat: b.lat, lon: b.lon, dir: b.dir, reg: false }, tapas: b.tapas });
  }

  // Casi todos los demás bares de verdad, con una tapa típica que depende del bar.
  for (const r of reales) {
    if (usados.has(r.id) || conReales.has(r.id) || NO_TAPAS.test(norm(r.nombre)) || azar(`${r.id}-sin`) < SIN_TAPA) continue;
    usados.add(r.id);
    const pick = (clave) => TIPICAS[Math.floor(azar(`${r.id}-${clave}`) * TIPICAS.length)];
    const hoy = pick('hoy');
    let antes = pick('antes');
    if (antes === hoy) antes = TIPICAS[(TIPICAS.indexOf(hoy) + 7) % TIPICAS.length];
    const dias = azar(`${r.id}-dia`);
    // La mayoría la subió hoy; algunos ayer o antes de ayer, para que se vea «la última que subió».
    const lista = dias < 0.85 ? [hoy] : [null, hoy];
    if (dias > 0.97) lista.unshift(null);
    if (azar(`${r.id}-historia`) < 0.35) lista.push(antes);
    conTapas.push({ bar: { ...r }, tapas: lista });
  }

  const tapas = [];
  let n = 0;
  for (const { bar, tapas: lista } of conTapas) {
    lista.forEach((tapa, dias) => {
      if (!tapa) return; // ese día no subió nada
      const [nombre, tipos, emoji] = tapa;
      n += 1;
      const clave = `${bar.id}-${dias}`;
      // Hoy: subida entre hace 10 minutos y hace 4 horas; días atrás, a media mañana.
      const ago = dias ? dias * 1440 + 60 + Math.round(azar(`${clave}-h`) * 120) : 10 + Math.round(azar(`${clave}-h`) * 230);
      // El id sale del bar y del día, para que la nota que pongas siga en su sitio al recargar.
      const id = `ejemplo-${bar.id}-${dias}`;
      let votos = 3 + Math.round(azar(`${clave}-v`) * 34);
      let media = Math.round((3.5 + azar(`${clave}-m`) * 1.4) * 10) / 10;
      const mia = notas[id]?.nota;
      if (mia) { media = (media * votos + mia) / (votos + 1); votos += 1; }
      tapas.push({
        id, bar: bar.id, fecha: dias ? dayBefore(dias) : fecha, at: new Date(now - ago * 60000).toISOString(),
        nombre, tipos, nota: '', autor: 'ejemplo', votos, media,
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
    // Seguidores de muestra, más los de verdad si los tiene.
    if (suyas.length) b.seguidores = (b.seguidores ?? 0) + 12 + Math.round(azar(`${b.id}-seg`) * 240);
  }
  // El resto de bares de verdad, tal cual (con sus tapas de verdad si las tienen).
  const puestos = new Set(bares.map((b) => b.id));
  for (const r of reales) if (!puestos.has(r.id)) bares.push(r);
  return { fecha, bares, tapas: [...tapasReales, ...tapas] };
}
