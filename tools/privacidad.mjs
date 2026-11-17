// Genera /privacidad/ y /privacidade/. Si cambia algo de lo que se guarda o se envía, hay que
// cambiarlo aquí, actualizar la fecha y volver a ejecutar: node tools/privacidad.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UPDATED = { es: '17 de noviembre de 2026', gl: '17 de novembro de 2026' };

const es = `<h1>Privacidad</h1>
<p class="sub">Que Tapa! no te pide cuenta, no usa cookies y no lleva publicidad ni programas que sigan lo que haces. Aquí tienes, punto por punto, qué pasa con tus datos.</p>
<div class="summary"><ul>
<li>No hace falta registrarse: Que Tapa! no sabe quién eres.</li>
<li>No hay cookies de seguimiento, ni analítica, ni publicidad.</li>
<li>Tu ubicación se usa en tu móvil y no se envía a ningún sitio.</li>
<li>Las fotos se preparan en tu móvil antes de enviarlas: salen sin la ubicación ni los datos de la cámara.</li>
</ul></div>

<h2>Lo que se queda en tu móvil</h2>
<p>El idioma, el modo claro u oscuro, tus bares guardados con la estrella, las tapas a las que diste «¡Que tapa!» (para no contar dos veces) y una copia de la última portada para abrir sin cobertura se guardan en tu propio navegador. Si tienes un bar, también su enlace privado. No son cookies de seguimiento y no salen del móvil. Se borran al borrar los datos de la web en el navegador.</p>

<h2>Tu ubicación</h2>
<p>Solo si das permiso. Se usa en tu móvil para enseñarte los bares que tienes cerca. No se envía a Que Tapa! ni se guarda. Si das de alta un bar con «Estoy en el bar», se envía el punto del bar, no el tuyo de después.</p>

<h2>Subir una tapa</h2>
<p>Se envían la foto, el nombre de la tapa, de qué es y el bar. Antes de salir del móvil, la foto se reduce y se vuelve a dibujar como un JPEG nuevo, así que no lleva la ubicación, la fecha de la cámara ni el modelo del móvil. No se guarda quién la sube ni su dirección IP. Las fotos de la gente se revisan antes de publicarse; si nadie las revisa en 3 días, se borran. Las publicadas se borran a los 180 días.</p>
<p>Para frenar abusos se cuenta cuántas fotos llegan de un mismo sitio con la IP mezclada con un secreto que cambia cada día. Ese resumen está solo en la memoria del servidor y se olvida al día siguiente: la IP no se guarda.</p>

<h2>«¡Que tapa!»</h2>
<p>Al votar se envía solo qué tapa. Para que cada persona cuente una vez al día se usa ese mismo resumen de la IP, que se olvida al día siguiente. De cada tapa se guarda solo el número de votos.</p>

<h2>Dar de alta un bar</h2>
<p>Se guardan el nombre del bar, la dirección, su sitio en el mapa, el teléfono o el correo que pongas, el Instagram y tu mensaje. El contacto solo se usa para mandarte el enlace privado del bar y no se publica. Las peticiones que no se aprueban se borran como mucho a los 180 días.</p>

<h2>«¿Algo no cuadra?»</h2>
<p>Se guarda lo que escribes, de qué bar o tapa hablas y, solo si lo dejas, tu contacto. No se guarda tu IP. Se borra cuando está resuelto y, como mucho, a los 180 días.</p>

<h2>El mapa, «Cómo llegar» y los bares</h2>
<p>El mapa se descarga de OpenFreeMap. «Cómo llegar» abre Google Maps, y el enlace de Instagram de un bar abre Instagram: son servicios de fuera con sus propias normas. Como pasa con cualquier web, reciben tu dirección IP al pedirles algo. La lista de bares sale de OpenStreetMap y la descarga el servidor, no tu móvil.</p>

<h2>El servidor</h2>
<p>La web no anota las visitas. El proxy que tiene delante guarda registros técnicos durante poco tiempo para mantener la web funcionando y segura.</p>

<h2>Quién está detrás</h2>
<p>Que Tapa! es un proyecto personal de Marco Gugliandolo López, sin relación con el Concello de Lugo ni con ninguna asociación de hostelería. No se vende ni se cede ningún dato a nadie. Para pedir que se borre una foto o cualquier dato tuyo, usa «¿Algo no cuadra?».</p>
<p class="note">Actualizado el ${UPDATED.es}.</p>`;

const gl = `<h1>Privacidade</h1>
<p class="sub">Que Tapa! non che pide conta, non usa cookies e non leva publicidade nin programas que sigan o que fas. Aquí tes, punto por punto, que pasa cos teus datos.</p>
<div class="summary"><ul>
<li>Non fai falla rexistrarse: Que Tapa! non sabe quen es.</li>
<li>Non hai cookies de seguimento, nin analítica, nin publicidade.</li>
<li>A túa localización úsase no teu móbil e non se envía a ningún sitio.</li>
<li>As fotos prepáranse no teu móbil antes de envialas: saen sen a localización nin os datos da cámara.</li>
</ul></div>

<h2>O que queda no teu móbil</h2>
<p>O idioma, o modo claro ou escuro, os teus bares gardados coa estrela, as tapas ás que lle deches «Que tapa!» (para non contar dúas veces) e unha copia da última portada para abrir sen cobertura gárdanse no teu propio navegador. Se tes un bar, tamén a súa ligazón privada. Non son cookies de seguimento e non saen do móbil. Bórranse ao borrar os datos da web no navegador.</p>

<h2>A túa localización</h2>
<p>Só se dás permiso. Úsase no teu móbil para amosarche os bares que tes preto. Non se envía a Que Tapa! nin se garda. Se dás de alta un bar con «Estou no bar», envíase o punto do bar, non o teu de despois.</p>

<h2>Subir unha tapa</h2>
<p>Envíanse a foto, o nome da tapa, de que é e o bar. Antes de saír do móbil, a foto redúcese e volve debuxarse como un JPEG novo, así que non leva a localización, a data da cámara nin o modelo do móbil. Non se garda quen a sube nin o seu enderezo IP. As fotos da xente revísanse antes de publicarse; se ninguén as revisa en 3 días, bórranse. As publicadas bórranse aos 180 días.</p>
<p>Para frear abusos cóntase cantas fotos chegan dun mesmo sitio coa IP mesturada cun segredo que cambia cada día. Ese resumo está só na memoria do servidor e esquécese ao día seguinte: a IP non se garda.</p>

<h2>«Que tapa!»</h2>
<p>Ao votar envíase só que tapa. Para que cada persoa conte unha vez ao día úsase ese mesmo resumo da IP, que se esquece ao día seguinte. De cada tapa gárdase só o número de votos.</p>

<h2>Dar de alta un bar</h2>
<p>Gárdanse o nome do bar, o enderezo, o seu sitio no mapa, o teléfono ou o correo que poñas, o Instagram e a túa mensaxe. O contacto só se usa para mandarche a ligazón privada do bar e non se publica. As peticións que non se aproban bórranse como moito aos 180 días.</p>

<h2>«Algo non cadra?»</h2>
<p>Gárdase o que escribes, de que bar ou tapa falas e, só se o deixas, o teu contacto. Non se garda a túa IP. Bórrase cando está resolto e, como moito, aos 180 días.</p>

<h2>O mapa, «Como chegar» e os bares</h2>
<p>O mapa descárgase de OpenFreeMap. «Como chegar» abre Google Maps, e a ligazón de Instagram dun bar abre Instagram: son servizos de fóra coas súas propias normas. Como pasa con calquera web, reciben o teu enderezo IP ao pedirlles algo. A lista de bares sae de OpenStreetMap e descárgaa o servidor, non o teu móbil.</p>

<h2>O servidor</h2>
<p>A web non anota as visitas. O proxy que ten diante garda rexistros técnicos durante pouco tempo para manter a web funcionando e segura.</p>

<h2>Quen está detrás</h2>
<p>Que Tapa! é un proxecto persoal de Marco Gugliandolo López, sen relación co Concello de Lugo nin con ningunha asociación de hostalaría. Non se vende nin se cede ningún dato a ninguén. Para pedir que se borre unha foto ou calquera dato teu, usa «Algo non cadra?».</p>
<p class="note">Actualizado o ${UPDATED.gl}.</p>`;

const page = (lang, title, body, other) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Que Tapa!</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
@font-face { font-family: "Atkinson Hyperlegible Next"; font-weight: 400; font-display: swap; src: url(/vendor/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2) format("woff2"); }
@font-face { font-family: "Atkinson Hyperlegible Next"; font-weight: 700; font-display: swap; src: url(/vendor/fonts/atkinson-hyperlegible-next-latin-700-normal.woff2) format("woff2"); }
@font-face { font-family: "Bricolage Grotesque"; font-weight: 700; font-display: swap; src: url(/vendor/fonts/bricolage-grotesque-latin-700-normal.woff2) format("woff2"); }
:root { --bg: #FFF6EC; --soft: #FCEBDD; --ink: #24130C; --mute: #6B5345; --brand: #F0431C; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #15100D; --soft: #2D211C; --ink: #FFF3E8; --mute: #D2BBAA; --brand: #FF5A2E; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.55 "Atkinson Hyperlegible Next", system-ui, sans-serif; }
a { color: inherit; text-underline-offset: 3px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; max-width: 760px; margin: 0 auto; padding: 14px 20px; }
.brand { display: flex; align-items: center; gap: 8px; font: 700 22px "Bricolage Grotesque", system-ui, sans-serif; letter-spacing: -.02em; color: var(--brand); text-decoration: none; }
.brand img { border-radius: 8px; }
.top nav { display: flex; gap: 16px; font-weight: 700; }
main { max-width: 760px; margin: 0 auto; padding: 4px 20px 40px; }
h1 { margin: 8px 0 6px; font: 700 clamp(32px, 7vw, 46px)/1.05 "Bricolage Grotesque", system-ui, sans-serif; letter-spacing: -.03em; }
h2 { margin: 30px 0 8px; font: 700 22px "Bricolage Grotesque", system-ui, sans-serif; letter-spacing: -.01em; }
.sub, .note { color: var(--mute); }
.summary { padding: 6px 20px; border-radius: 18px; background: var(--soft); }
.summary li { margin: 8px 0; }
</style>
</head>
<body>
<header class="top"><a class="brand" href="/"><img src="/icon.svg" width="30" height="30" alt="">Que Tapa!</a><nav><a href="${other.href}" lang="${other.lang}">${other.label}</a><a href="/">${lang === 'gl' ? 'Ao mapa' : 'Al mapa'}</a></nav></header>
<main>${body}</main>
</body>
</html>
`;

const root = fileURLToPath(new URL('../app/', import.meta.url));
mkdirSync(`${root}privacidad`, { recursive: true });
mkdirSync(`${root}privacidade`, { recursive: true });
writeFileSync(`${root}privacidad/index.html`, page('es', 'Privacidad', es, { href: '/privacidade/', lang: 'gl', label: 'Galego' }));
writeFileSync(`${root}privacidade/index.html`, page('gl', 'Privacidade', gl, { href: '/privacidad/', lang: 'es', label: 'Castellano' }));
console.log('Páginas de privacidad generadas');
