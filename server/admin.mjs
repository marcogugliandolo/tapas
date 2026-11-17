// Que Tapa!: la página privada de moderación (/api/admin?clave=…). Sin JavaScript: cada botón
// es un formulario pequeño. Aquí se publican o se borran las fotos de los clientes, se aprueban
// los bares que piden el alta (y se les manda su enlace) y se leen los mensajes.
import { escapeHTML as e } from './util.mjs';

export const REPORTES = {
  foto: 'La foto no es de una tapa o no es de este bar',
  cerrado: 'El bar está cerrado o ya no existe',
  sitio: 'El bar está mal colocado en el mapa',
  otro: 'Otra cosa',
};

const when = (iso) => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' });

/** Un teléfono español escrito de cualquier forma, listo para wa.me (34…), o '' si no lo parece. */
export function waNumber(contact) {
  const digits = String(contact ?? '').replace(/[^\d+]/g, '');
  const clean = digits.replace(/^\+/, '').replace(/^00/, '');
  if (/^[67]\d{8}$/.test(clean)) return `34${clean}`;
  if (/^34[67]\d{8}$/.test(clean)) return clean;
  return '';
}

export function welcomeText(bar, link) {
  return `¡Hola! Ya estáis en Que Tapa!, el mapa de las tapas de Lugo 🍢\n\nEste es el enlace privado de ${bar.nombre}: ${link}\n\nÁbrelo en el móvil del bar y guárdalo en la pantalla de inicio. Desde ahí subís la tapa de cada día en 20 segundos: foto, nombre y listo. No lo compartáis con nadie más.`;
}

export function adminPage({ clave, aviso, pendientes, recientes, altas, reportes, bares, ocultos, nombreDe, panelLink, osmCount }) {
  const btn = (accion, id, label, cls = '') => `<form method="post" action="/api/admin"><input type="hidden" name="clave" value="${e(clave)}"><input type="hidden" name="accion" value="${e(accion)}"><input type="hidden" name="id" value="${e(id)}"><button type="submit" class="${cls}">${label}</button></form>`;
  const foto = (t) => `<a href="/api/fotos/${e(t.foto)}.jpg" target="_blank" rel="noopener"><img src="/api/fotos/${e(t.foto)}-m.jpg" alt="" width="96" height="96" loading="lazy"></a>`;
  const map = (lat, lon) => `<a href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lon}#map=19/${lat}/${lon}" target="_blank" rel="noopener">ver en el mapa</a>`;

  let banner = '';
  if (aviso?.tipo === 'enlace') {
    const link = panelLink(aviso.bar);
    const msg = welcomeText(aviso.bar, link);
    const wa = waNumber(aviso.bar.contacto);
    banner = `<section class="aviso ok"><h2>Enlace de ${e(aviso.bar.nombre)}</h2>
      <p>Mándaselo al bar. Con él suben su tapa sin pasar por ti. Si se pierde o se filtra, pulsa «Nueva clave» y el anterior deja de valer.</p>
      <p><input readonly value="${e(link)}" aria-label="Enlace del panel"></p>
      <p class="acciones"><a class="boton" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Enviar por WhatsApp${wa ? ` al ${e(aviso.bar.contacto)}` : ''}</a>
      ${aviso.bar.contacto ? `<span class="meta">Contacto: ${e(aviso.bar.contacto)}</span>` : ''}</p></section>`;
  } else if (aviso) {
    banner = `<section class="aviso ${aviso.tipo === 'ok' ? 'ok' : 'error'}"><p>${e(aviso.texto)}</p></section>`;
  }

  const pend = pendientes.map((t) => `<article class="tapa">${foto(t)}<div><strong>${e(t.nombre)}</strong><p>${e(nombreDe(t.bar))}</p><p class="meta">${e(when(t.at))} · de un cliente</p>
    <div class="acciones">${btn('publicar', t.id, 'Publicar', 'si')}${btn('borrar-tapa', t.id, 'Borrar', 'no')}</div></div></article>`).join('');

  const alt = altas.map((a) => `<article><strong>${e(a.nombre)}</strong>${a.osm ? ' <span class="chip">ya estaba en el mapa</span>' : ''}
    <p>${e(a.dir || 'Sin dirección')} · ${map(a.lat, a.lon)}</p>
    <p>Contacto: <strong>${e(a.contacto)}</strong>${a.insta ? ` · Instagram: @${e(a.insta)}` : ''}</p>
    ${a.mensaje ? `<p class="msg">${e(a.mensaje)}</p>` : ''}<p class="meta">${e(when(a.at))}</p>
    <div class="acciones">${btn('aprobar-alta', a.id, 'Aprobar y crear su enlace', 'si')}${btn('borrar-alta', a.id, 'Borrar', 'no')}</div></article>`).join('');

  const rep = reportes.map((r) => `<article><span class="chip">${e(REPORTES[r.tipo] ?? r.tipo)}</span> <span class="meta">${e(when(r.at))}</span>
    ${r.barNombre ? `<p><strong>${e(r.barNombre)}</strong>${r.tapaNombre ? ` · ${e(r.tapaNombre)}` : ''}</p>` : ''}
    ${r.texto ? `<p class="msg">${e(r.texto)}</p>` : ''}${r.contacto ? `<p>Contacto: <strong>${e(r.contacto)}</strong></p>` : ''}
    <div class="acciones">${r.tapa ? btn('borrar-tapa', r.tapa, 'Borrar esa tapa', 'no') : ''}${r.bar ? btn('quitar-bar', r.bar, 'Quitar el bar del mapa', 'no') : ''}${btn('reporte-hecho', r.id, 'Hecho, borrar mensaje')}</div></article>`).join('');

  const bars = bares.map((b) => `<article class="fila"><div><strong>${e(b.nombre)}</strong><p class="meta">${e(b.dir || '')} · ${map(b.lat, b.lon)} · alta ${e(when(b.alta))}</p></div>
    <div class="acciones">${btn('ver-enlace', b.id, 'Ver enlace')}${btn('nueva-clave', b.id, 'Nueva clave')}${btn('quitar-bar', b.id, 'Quitar', 'no')}</div></article>`).join('');

  const rec = recientes.map((t) => `<article class="tapa">${foto(t)}<div><strong>${e(t.nombre)}</strong><p>${e(nombreDe(t.bar))}</p>
    <p class="meta">${e(when(t.at))} · ${t.autor === 'bar' ? 'del bar' : 'de un cliente'} · ${t.votos ? `★ ${(t.suma / t.votos).toFixed(1).replace('.', ',')} (${t.votos} ${t.votos === 1 ? 'nota' : 'notas'})` : 'sin notas'}</p>
    <div class="acciones">${btn('borrar-tapa', t.id, 'Borrar', 'no')}</div></div></article>`).join('');

  const hid = ocultos.map((b) => `<article class="fila"><div><strong>${e(b.nombre)}</strong></div><div class="acciones">${btn('mostrar-bar', b.id, 'Volver a mostrar')}</div></article>`).join('');

  const section = (title, count, body, empty) => `<section><h2>${title}${count ? ` <span class="n">${count}</span>` : ''}</h2>${body || `<p class="vacio">${empty}</p>`}</section>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Que Tapa! · Moderación</title><style>
*{box-sizing:border-box}body{margin:0;padding:20px 16px 48px;font:16px/1.45 system-ui,sans-serif;background:#F0F2F0;color:#121416}main{max-width:780px;margin:0 auto}
h1{font-size:28px;margin:0 0 2px;letter-spacing:-.02em}h1 b{color:#E4472B}p.sub{margin:0 0 20px;color:#4A5158}
h2{font-size:19px;margin:28px 0 10px}h2 .n{display:inline-block;min-width:26px;padding:0 8px;border-radius:13px;background:#E4472B;color:#fff;font-size:14px;text-align:center}
article{background:#fff;border-radius:16px;padding:14px 16px;margin:0 0 10px;box-shadow:0 1px 6px rgba(18,20,22,.08)}article p{margin:4px 0}
.tapa{display:flex;gap:14px;align-items:flex-start}.tapa img{width:96px;height:96px;object-fit:cover;border-radius:12px;background:#E6E8E6;display:block}
.fila{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.meta{color:#4A5158;font-size:14px}.meta a{color:inherit}.msg{white-space:pre-wrap}.vacio{color:#4A5158}
.chip{display:inline-block;padding:2px 10px;border-radius:10px;background:#121416;color:#fff;font-size:13px;font-weight:700}
.acciones{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}form{margin:0}
button,.boton{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border:0;border-radius:12px;background:#E6E8E6;color:#121416;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
button.si,.boton{background:#E4472B;color:#fff}button.no{background:transparent;color:#B42318;border:2px solid #F2C9C4}
.aviso{border-radius:16px;padding:14px 16px;margin:0 0 16px}.aviso.ok{background:#E3F7E8}.aviso.error{background:#FDE4E1}.aviso h2{margin:0 0 6px}
.aviso input{width:100%;padding:10px 12px;border:1px solid #C9CDCF;border-radius:10px;font:inherit;font-size:14px;background:#fff}
</style></head><body><main>
<h1><b>Que Tapa!</b> · moderación</h1><p class="sub">Guarda esta página en favoritos y no la compartas. ${osmCount} sitios de OpenStreetMap en el mapa.</p>
${banner}
${section('Fotos de clientes por revisar', pendientes.length, pend, 'No hay fotos esperando. Si no se revisan en 3 días, se borran solas.')}
${section('Bares que piden el alta', altas.length, alt, 'Ninguno por ahora.')}
${section('Mensajes de «¿Algo no cuadra?»', reportes.length, rep, 'No hay mensajes.')}
${section('Bares dados de alta', bares.length, bars, 'Todavía ninguno. Cuando apruebes un alta, saldrá aquí con su enlace.')}
${section('Últimas tapas publicadas', 0, rec, 'Todavía no hay tapas.')}
${ocultos.length ? section('Quitados del mapa', ocultos.length, hid, '') : ''}
</main></body></html>`;
}
