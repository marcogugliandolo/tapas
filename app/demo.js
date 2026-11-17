// Que Tapa!: el modo de ejemplo (/?ejemplo). Bares y tapas INVENTADOS para ver cómo queda la web
// llena, por ejemplo para enseñársela a un bar. Los nombres son ficticios a propósito y las «fotos»
// son dibujos: nada de esto se envía al servidor y la web lo avisa arriba.

const FONDOS = [
  ['#D9A066', '#9C5A33'],
  ['#C9824A', '#7A3B22'],
  ['#5B6770', '#262C31'],
  ['#E7B77E', '#B5713F'],
  ['#B85C38', '#4E2316'],
  ['#7E5A44', '#3A2418'],
];

/** Un dibujo de la tapa en su plato, sobre una mesa de madera. */
function dibujo(emoji, fondo, square = false) {
  const [a, b] = FONDOS[fondo % FONDOS.length];
  const vetas = Array.from({ length: 7 }, (_, i) => `<path d="M-20 ${40 + i * 64} C 150 ${20 + i * 64}, 420 ${70 + i * 64}, 620 ${36 + i * 64}" />`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${square ? '75 0 450 450' : '0 0 600 450'}">
<defs><radialGradient id="g" cx="50%" cy="38%" r="80%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>
<radialGradient id="p" cx="50%" cy="42%" r="60%"><stop offset=".72" stop-color="#fffaf3"/><stop offset="1" stop-color="#e8dccd"/></radialGradient></defs>
<rect x="0" y="0" width="600" height="450" fill="url(#g)"/>
<g fill="none" stroke="#000" stroke-opacity=".10" stroke-width="3">${vetas}</g>
<ellipse cx="306" cy="256" rx="212" ry="140" fill="#000" fill-opacity=".22"/>
<ellipse cx="300" cy="238" rx="206" ry="134" fill="url(#p)"/>
<ellipse cx="300" cy="238" rx="150" ry="94" fill="none" stroke="#e6d6c3" stroke-width="5"/>
<text x="300" y="300" font-size="168" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
<circle cx="120" cy="96" r="7" fill="#fff" fill-opacity=".35"/><circle cx="500" cy="372" r="5" fill="#fff" fill-opacity=".3"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const madridDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

export function demoData() {
  const now = Date.now();
  const fecha = madridDay(now - 5 * 3600000);
  const dayBefore = (n) => madridDay(now - 5 * 3600000 - n * 86400000);
  const bares = [
    { id: 'demo-1', nombre: 'Taberna do Exemplo', lat: 43.01215, lon: -7.55705, dir: 'Rúa Nova (ejemplo)', reg: true, insta: '' },
    { id: 'demo-2', nombre: 'Bar A Proba', lat: 43.01025, lon: -7.5579, dir: 'Praza do Campo (ejemplo)', reg: true },
    { id: 'demo-3', nombre: 'Mesón da Mostra', lat: 43.00985, lon: -7.5586, dir: 'Rúa da Cruz (ejemplo)', reg: false },
    { id: 'demo-4', nombre: 'O Ensaio', lat: 43.00935, lon: -7.5561, dir: 'Praza Maior (ejemplo)', reg: false },
    { id: 'demo-5', nombre: 'Vinoteca Boceto', lat: 43.0128, lon: -7.5552, dir: 'Santo Domingo (ejemplo)', reg: true },
    { id: 'demo-6', nombre: 'A Barra de Proba', lat: 43.0185, lon: -7.5452, dir: 'A Milagrosa (ejemplo)', reg: true },
    { id: 'demo-7', nombre: 'Café Simulacro', lat: 43.0224, lon: -7.5505, dir: 'Aceña de Olga (ejemplo)', reg: false },
    { id: 'demo-8', nombre: 'Bar Maqueta', lat: 43.0115, lon: -7.5594, dir: 'Praza de Santa María (ejemplo)', reg: false },
    { id: 'demo-9', nombre: 'Tasca Ficticia', lat: 43.0136, lon: -7.5603, dir: 'Ronda da Muralla (ejemplo)', reg: false },
    { id: 'demo-10', nombre: 'Cervecería Inventada', lat: 43.0078, lon: -7.5552, dir: 'Avenida de ejemplo', reg: false },
  ];
  const min = (m) => new Date(now - m * 60000).toISOString();
  const raw = [
    ['demo-1', 'Raxo con patatas', ['carne'], '🥩', 23, 40, 'bar', 'Hasta las 15:30', fecha],
    ['demo-2', 'Callos de la casa', ['cuchara'], '🥘', 31, 70, 'bar', '', fecha],
    ['demo-3', 'Pulpo á feira', ['mar', 'sin-gluten'], '🐙', 18, 130, 'cliente', '', fecha],
    ['demo-4', 'Tortilla jugosa', ['huevo', 'veggie'], '🍳', 12, 190, 'cliente', '', fecha],
    ['demo-6', 'Zorza con pan', ['carne'], '🍖', 9, 25, 'bar', 'Solo con vino', fecha],
    ['demo-5', 'Croquetas de lacón', ['carne'], '🧆', 6, 300, 'bar', '', fecha],
    ['demo-8', 'Pimientos de Padrón', ['veggie', 'sin-gluten'], '🫑', 4, 10, 'cliente', '', fecha],
    ['demo-7', 'Empanada de xoubas', ['mar'], '🥧', 2, 240, 'cliente', '', fecha],
    ['demo-1', 'Oreja a la plancha', ['carne'], '🥓', 15, 1500, 'bar', '', dayBefore(1)],
    ['demo-2', 'Lentejas con chorizo', ['cuchara'], '🍲', 11, 2900, 'bar', '', dayBefore(2)],
  ];
  const tapas = raw.map(([bar, nombre, tipos, emoji, fuegos, ago, autor, nota, dia], i) => ({
    id: `demo-t${i + 1}`, bar, fecha: dia, at: min(ago), nombre, tipos, nota, autor, fuegos,
    img: dibujo(emoji, i), mini: dibujo(emoji, i, true),
  }));
  return { fecha, bares, tapas };
}
