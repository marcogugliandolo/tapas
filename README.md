# Que Tapa!

Las tapas de Lugo, hoy y con foto: qué pone cada bar, en un mapa, en el móvil y en el ordenador, en castellano y en gallego. Mismo lenguaje que Xa Vén: interfaz neutra y limpia, y el color lo ponen las fotos; el pimentón solo marca subir y votar.

- **El mapa con las fotos.** Cada bar con tapa hoy sale con la foto de su tapa y su nota media.
- **«Hoy en Lugo».** Las tapas del día en fila, con filtros (carne, del mar, de cuchara, huevo y tortilla, vegetariana, sin gluten) y las tres mejor valoradas.
- **Como una red social.** Arriba, las «historias» de los bares que han subido tapa hoy (aro de color si aún no la viste). Debajo, las pestañas **Para ti**, **Siguiendo** y **Top**, con un muro de publicaciones: el bar, la foto grande, las estrellas para puntuar y compartir. Cada bar tiene su **perfil** (tapas, nota media, seguidores, botón Seguir y la rejilla de sus tapas). Seguir no pide cuenta: el móvil guarda a quién sigues y manda un número al azar para que el servidor cuente los seguidores.
- **La tapa del día y el Top.** Arriba, la mejor valorada de hoy a todo lo ancho. La pestaña **Top** tiene las 5 mejores de hoy y las 10 de la semana, con medallas (una por bar y con al menos 3 notas).
- **Ruta de tapas** (`/#tapeo`). Elige 3 o 4 bares con tapa hoy, bien valorados y cerca unos de otros, y dibuja el camino andando con las paradas numeradas.
- **Logo del bar.** El bar lo sube desde su panel (o una foto de la fachada) y sale en su perfil y en el muro en vez de las iniciales.
- **Compartir con foto.** El enlace `/compartir/<bar>` sale en WhatsApp con la foto de la tapa de hoy y su nota; al abrirlo, lleva a la ficha del bar.
- **Las suben los bares.** Quien entra en la web solo mira las tapas, las puntúa y llega andando; la foto de cada día la sube el bar desde su panel.
- **Notas de 1 a 5 estrellas.** Al abrir una tapa la puntúas (una nota por persona, tapa y día; se puede cambiar) y cada bar enseña su media juntando todas sus tapas. Sin cuentas.
- **Fotos de clientes (apagado).** El código para que cualquiera suba la foto de lo que le pusieron sigue ahí, con moderación, pero está oculto: se enciende con `SUBEN_CLIENTES` en `app/app.js`. Igual las tarjetas «¿Tienes un bar?» con `MOSTRAR_ALTA`.
- **Panel del bar.** Cada bar dado de alta tiene un enlace privado: con él sube su tapa en 20 segundos, sale al momento con la marca «Foto del bar» y ve su nota media.
- **Todos los bares de Lugo.** El servidor descarga una vez al día los bares, cafeterías y restaurantes de OpenStreetMap, así que salen en el mapa aunque no se hayan dado de alta. Cada uno tiene su botón «¿Es tu bar?».
- **Cómo llegar a pie** dentro de la propia web: la ruta por las calles de Lugo dibujada en el mapa, con los minutos andando, y «Empezar» para que el mapa te siga hasta el bar sin que se apague la pantalla. También se puede abrir en Google Maps o en Mapas de Apple para que te vayan indicando.
- **Tus bares** con el marcador, **cerca de ti** con la ubicación, **buscador** de bares y tapas, **compartir** cada bar con un enlace y **modo oscuro**.
- **Se instala como una app** y abre sin cobertura con lo último que vio.
- **Sin cuenta, sin cookies de seguimiento y sin publicidad.** Lo explica la página de [privacidad](app/privacidad/index.html).

**Tapas de ejemplo en la portada.** Mientras los bares empiezan a subir las suyas, la web pone una tapa de ejemplo en casi todos los bares que aún no tienen tapa de verdad: unos con su tapa conocida (Taberna Daniel, Las Cinco Vigas, 4 Rúas, La Nuez, Cervecería Lagar, A Adega, Paprica, A Xarra…) y el resto con una tapa típica (siempre la misma para cada bar; uno de cada diez se queda sin tapa, y las pizzerías, japoneses o heladerías no llevan). Llevan la marca «Ejemplo», la portada avisa arriba, sus fotos son dibujos y las notas que se les ponen solo cuentan en ese móvil. En cuanto un bar sube su tapa, la de verdad sustituye al ejemplo. Para apagarlo: `EJEMPLOS_EN_PORTADA = false` en `app/app.js`. Para ver solo lo de verdad: **`/?real`**. Y **`/?ejemplo`** es todo de ejemplo y no envía nada (ni subidas, ni notas, ni altas).

## Desplegar en Portainer

1. **Stacks › Add stack › Web editor** y pega `docker-compose.yml`.
2. Si el repositorio es privado, añade `GITHUB_TOKEN` (un token con permiso de lectura) en **Environment variables**.
3. Despliega en el servidor que quieras. El contenedor entra en la red `npm-master_default` y publica el puerto `3092` (se cambia con `TAPAS_PORT`).
4. En Nginx Proxy Manager, apunta `tapas.marcogugliandolo.com` a `http://tapas:3000` con https. La cámara y la ubicación del móvil solo funcionan con https.
5. Abre **Containers › tapas-api › Logs** y guarda en favoritos la dirección de la línea `[admin]`: es la página de moderación.

Para publicar cambios: push a GitHub y reinicia los dos contenedores (`tapas` y `tapas-api`). Los datos están en el volumen `tapas-datos` y no se pierden al reiniciar.

| Variable | Para qué |
| :--- | :--- |
| `TAPAS_PORT` | Puerto del servidor (3092). |
| `GITHUB_TOKEN` | Solo si el repositorio es privado. |
| `PUBLIC_URL` | La dirección pública, para los enlaces que se mandan a los bares (`https://tapas.marcogugliandolo.com`). |
| `ADMIN_CLAVE` | Otra clave para la moderación. Si no se pone, se crea sola la primera vez y se queda en el volumen. |
| `NTFY_URL` | Aviso al móvil con la app [ntfy](https://ntfy.sh) cada vez que llega una foto por revisar, un bar nuevo o un mensaje. Por ejemplo `https://ntfy.sh/un-nombre-largo-que-solo-sepas-tu`. |
| `OSM=0` | No descargar los bares de OpenStreetMap. |
| `OVERPASS_URL` | Otro servidor de Overpass si el de siempre falla. |

## Cómo entra un bar

1. El bar pulsa «¿Tienes un bar?» o «¿Es tu bar?» en su ficha, deja su teléfono o correo y, si no estaba en el mapa, lo marca.
2. Te llega el aviso (si pusiste `NTFY_URL`) y en la página de moderación pulsas **Aprobar y crear su enlace**.
3. Sale su enlace privado y un botón **Enviar por WhatsApp** con el mensaje ya escrito (si dejó un móvil, va directo a su número).
4. El bar abre el enlace en el móvil del bar, lo guarda en la pantalla de inicio y desde ahí sube la tapa cada día.

Si un enlace se pierde o se filtra, **Nueva clave** crea otro y el anterior deja de valer.

## Moderación

La página `/api/admin?clave=…` no tiene JavaScript: cada botón es un formulario.

- **Fotos de clientes por revisar:** Publicar o Borrar. Las que nadie revisa en 3 días se borran solas.
- **Bares que piden el alta:** Aprobar (crea su enlace) o Borrar.
- **Mensajes de «¿Algo no cuadra?»:** con botones para borrar esa tapa o quitar el bar del mapa.
- **Bares dados de alta:** ver su enlace, darle una clave nueva o quitarlo.
- **Últimas tapas publicadas:** por si hay que borrar alguna.

Las fotos de los bares salen al momento, sin pasar por aquí.

## Probarlo en el ordenador

```bash
node tools/servidor-local.mjs        # http://localhost:8080/   (PUERTO=…, OSM=1 para bajar los bares)
```

Sirve la web y la API como en el servidor y guarda los datos en `.datos-locales/`. La dirección de la moderación sale al arrancar.

Pruebas de la API: `cd server && node --test`. Rutas a pie: `node tools/check-ruta.mjs`. Textos sin traducir: `node tools/check-i18n.mjs`.

## La API (`server/`)

Node 22 sin dependencias. Todo se guarda en ficheros JSON y JPEG dentro de `DATA_DIR`.

| Ruta | Qué hace |
| :--- | :--- |
| `GET /api/hoy` | Los bares (dados de alta y de OpenStreetMap) y las tapas publicadas de los últimos 7 días. |
| `GET /api/bar/<id>` | Un bar y sus últimas 40 tapas. |
| `GET /api/fotos/<id>.jpg` | La foto grande (`<id>-m.jpg`, la miniatura del mapa). No cambian nunca: se guardan en caché un mes. |
| `POST /api/tapas` | Sube una tapa. Con la clave del bar sale al momento; sin ella, espera a la moderación. |
| `POST /api/logo` | `{ bar, clave, foto, mini }` (JPEG cuadrado de 512 y 160 px) o `{ bar, clave, quitar: true }`: el logo del bar. |
| `GET /compartir/<bar>` | Página con la vista previa para WhatsApp (foto de la tapa de hoy, nombre y nota) que lleva a la ficha del bar. |
| `POST /api/seguir` | `{ bar, id, on }`: seguir (o dejar de seguir) un bar. `id` es el número al azar del móvil; el servidor solo guarda esos números para contar seguidores. |
| `POST /api/voto` | `{ tapa, nota }` con nota de 1 a 5: una por persona, tapa y día (si repite, se cambia). Se puntúan la tapa de hoy y la de ayer. |
| `POST /api/altas` | Un bar pide el alta. |
| `POST /api/panel` | Lo que ve el bar en su panel (con su clave). |
| `POST /api/tapas/borrar` | El bar borra una tapa suya. |
| `POST /api/reportes` | «¿Algo no cuadra?». |
| `GET/POST /api/admin` | La página de moderación. |

**El día de viños empieza a las 5 de la mañana:** una tapa subida a la 1 de la noche cuenta para el día anterior.

**Fotos.** El móvil las reduce (1280 px la grande y 240 px la miniatura cuadrada) y las vuelve a dibujar como JPEG, así que no llevan la ubicación ni los datos de la cámara. El servidor comprueba que de verdad son JPEG, de qué tamaño son y cuánto pesan antes de guardarlas.

**Límites.** Para frenar abusos se cuenta lo que llega de cada sitio con la IP mezclada con un secreto que cambia cada día; se queda solo en memoria y no se guarda. Clientes: 6 fotos por hora y 20 al día, y como mucho 6 fotos de un mismo bar esperando. Bares: 8 tapas al día. Altas: 3 por hora.

## Idiomas

Los textos se escriben en castellano dentro de `t('…')` y su traducción al gallego está en `app/i18n.js`. `node tools/check-i18n.mjs` avisa de lo que falte.

## Privacidad

La página está en `/privacidad/` (y `/privacidade/` en gallego). Si cambia algo de lo que se guarda o se envía, hay que actualizar `tools/privacidad.mjs` y volver a ejecutar `node tools/privacidad.mjs`. El contenedor `tapas` no anota las visitas (`access_log off`).

## Archivos

```
app/index.html, style.css        la página
app/app.js                       mapa, pantallas, subir fotos, panel del bar
app/i18n.js                      castellano y gallego
app/demo.js                      el modo de ejemplo (/?ejemplo)
app/ruta.js                      rutas a pie por el callejero (lo comprueba tools/check-ruta.mjs)
app/sw.js                        la web sin cobertura y las fotos guardadas
app/data/                        estilo del mapa y calles de Lugo (para el mapa sin conexión y para las rutas a pie)
app/vendor/                      MapLibre y tipografías, sin CDN
app/privacidad, privacidade      generadas por tools/privacidad.mjs
server/api.mjs                   la API
server/admin.mjs                 la página de moderación
server/fotos.mjs                 comprobar y guardar las fotos
server/osm.mjs                   los bares de OpenStreetMap
nginx.conf                       servidor en el puerto 3000
docker-compose.yml               stack para Portainer
```

Licencias y procedencia de los datos en [NOTICE.md](NOTICE.md).
