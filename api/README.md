# Checkout de Ascua

Worker en Cloudflare que cobra con **Mercado Pago** y **Flow**, verifica los webhooks,
registra los pedidos y manda los avisos por email.

## Por que existe esto

El sitio es HTML plano: no hay servidor donde calcular un total confiable. Si el
navegador dijera el precio, cualquiera podria editarlo a $1 y pagarlo. Por eso el
total se calcula aqui, contra la base de datos, y el navegador solo manda ids y
cantidades.

## Rutas

| Metodo | Ruta | Que hace |
| --- | --- | --- |
| POST | `/api/checkout` | Crea el pedido, calcula el total, devuelve la URL de pago |
| GET/POST | `/api/webhook/mercadopago` | Notificacion de pago de MP (firma obligatoria) |
| GET/POST | `/api/webhook/flow` | Notificacion de pago de Flow (firma obligatoria) |
| GET | `/api/pedidos` | Lista pedidos. Requiere `Authorization: Bearer <CLAVE_PANEL>` |
| POST | `/api/pedidos/:id/tracking` | Registra el numero de seguimiento. Requiere la misma clave |
| GET | `/api/salud` | Dice que secrets faltan |

## Puesta en marcha

### 1. Instalar y crear la base

```bash
cd api
npm install
```

Crea la base D1 desde el panel de Cloudflare (Workers & Pages → D1 SQL Database) o
por consola:

```bash
npx wrangler d1 create ascua
```

Pega el `database_id` que te muestre en `wrangler.toml`, y reemplaza
`REEMPLAZAR_CON_EL_ID_DE_TU_D1`.

```bash
npx wrangler d1 execute ascua --file=./schema.sql   # tablas
npx wrangler d1 execute ascua --file=./seed.sql    # precios iniciales
```

### 2. Credenciales

**Mercado Pago.** Entra a [mercadopago.com.ar/developers](https://www.mercadopago.com.ar/developers)
y crea una aplicacion. En "Credenciales" tienes el token de produccion (`APP_USR-...`)
y, si usas el panel de pruebas, uno sandbox. El *secreto de firma* esta en
"Ajustes → Notificaciones y retiros" (a veces hay que activar modo prueba primero).

**Flow.** Entra a [web.flow.cl/ayuda](https://web.flow.cl/en-cl/ayuda/) → Integraciones
→ Integración por API. Necesitas el **API Key** y el **Secret Key**, distintos para
producción y sandbox.

Carga los secrets (nunca al `wrangler.toml`):

```bash
npx wrangler secret put MP_ACCESS_TOKEN
npx wrangler secret put MP_ACCESS_TOKEN_SANDBOX
npx wrangler secret put MP_WEBHOOK_SECRET
npx wrangler secret put FLOW_API_KEY
npx wrangler secret put FLOW_SECRET_KEY
npx wrangler secret put FLOW_API_KEY_SANDBOX
npx wrangler secret put FLOW_SECRET_SANDBOX
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put CLAVE_PANEL
```

`CLAVE_PANEL` es la contraseña de `panel.html`. Inventa una larga.

**Emails.** Crea cuenta en [resend.com](https://resend.com) y verifica tu dominio
para enviar desde el. `EMAIL_REMITENTE` en `wrangler.toml` debe coincidir con el
dominio verificado. Sin esto el pago funciona igual, pero no llegan los avisos.

### 3. Probar en local

En dos terminales:

```bash
cd api && npx wrangler dev          # Worker en http://127.0.0.1:8787
cd ..    && npm start               # sitio en http://localhost:5173
```

En `assets/js/config.js`, `checkout.sandbox` debe estar en `true` para usar las
credenciales de prueba.

Abre `http://localhost:5173/checkout.html` con algo en el carrito.

**Los webhooks no llegan a localhost.** Mercado Pago y Flow necesitan una URL publica.
Opciones:

- `npx wrangler dev --remote` y apuntas `ORIGEN` a la URL que te muestre
- Un tunel: `npx localtunnel --port 8787` o `cloudflared tunnel --url http://localhost:8787`
- Registra los webhooks a mano desde el panel de la pasarela, disparando el pago de
  prueba que te generan

### 4. Webhooks

Registra estas URLs en el panel de cada pasarela (produccion):

```
https://TU-WORKER.workers.dev/api/webhook/mercadopago
https://TU-WORKER.workers.dev/api/webhook/flow
```

Mercado Pago manda eventos de pago **y** de preferencia. Solo se procesa lo que
tiene `status: approved`; un pago pendiente o rechazado no registra nada.

### 5. Desplegar

Un solo despliegue publica el sitio y la API. `wrangler.toml` ya declara
`[assets] directory = "../dist"`, asi que antes hay que generar `dist/`:

```bash
node scripts/preparar-sitio.mjs     # desde la raiz del proyecto
cd api && npx wrangler deploy
```

Despues ajusta `ORIGEN` en `wrangler.toml` al dominio real y pon
`checkout.sandbox` en `false` en `assets/js/config.js`.

## Por que existe `scripts/preparar-sitio.mjs`

El error mas comun al desplegar esto desde GitHub es:

```
ERROR] Asset too large.
  file /opt/buildhome/repo/node_modules/workerd/bin/workerd with a size of 128 MiB
```

Pasa cuando el directorio de assets es la raiz del repositorio. Cloudflare sube
**todo** lo que hay ahi, y cuando el comando de deploy es `npx wrangler deploy`,
la propia instalacion de wrangler crea `node_modules/` con `workerd` de 128 MB. El
archivo sube como si fuera parte del sitio y el deploy se cae.

`preparar-sitio.mjs` copia a `dist/` solo lo que el navegador necesita
(`*.html`, `assets/`, `data/`, mas `_headers`), y `wrangler.toml` apunta
`directory` ahi. Es un sitio sin build, asi que "compilar" es copiar: sigue sin
haber bundler ni paso de compilacion, solo que el resultado se separa de las
herramientas.

`npm test` verifica que `dist/` no arrastre `node_modules`, `api/` ni `scripts/`,
y que ningun archivo pase de 25 MiB. Si falla, el deploy fallaria igual.

## Desplegar desde GitHub (Cloudflare Workers Builds)

En el panel de Cloudflare, al conectar el repositorio:

| Campo | Valor |
| --- | --- |
| Build command | `node scripts/preparar-sitio.mjs && cd api && npx wrangler deploy` |
| Deploy command | *(dejar vacio)* |
| Root directory | *(dejar vacio, la raiz del repo)* |

El build command tiene que incluir `cd api`: sin eso, wrangler no encuentra
`api/wrangler.toml`, genera uno nuevo que toma la raiz entera como assets, y
vuelves al error de arriba. `deploy command` se deja vacio a proposito, porque si
no, wrangler ejecutaria `wrangler deploy` dos veces.

Dos cosas mas que conviene revisar en el panel:

- **Variables**: `ORIGEN`, `EMAIL_REMITENTE`, `EMAIL_NOTIFICACIONES`, `RAZON_SOCIAL`,
  `RUT`, `DOMICILIO`. En los builds de Cloudflare se cargan como secretos para no
  depender del `wrangler.toml`.
- **Bindings**: la base D1 debe estar asociada al Worker con el binding `DB`.

Los secrets de las pasarelas (`wrangler secret put`) no se ponen en el panel de
builds: se cargan una vez con `npx wrangler secret put` o desde
Settings → Variables and Secrets.

## Precios: dos lugares, uno solo real

| Donde | Que hace | Quien lo ve |
| --- | --- | --- |
| `data/productos.json` | Muestra el precio en la pagina | El cliente |
| tabla `productos` en D1 | Define lo que se cobra | El servidor |

`npm test` falla si divergen. Cuando cambies precios, cambialos en los dos, o
regenera el SQL con `npm run sync` (que escribe `api/precios.sql`) y cargalo con:

```bash
cd api && npx wrangler d1 execute ascua --remote --file=./precios.sql
```

## Envio y precios

- Envio fijo: $3.990 CLP
- Envio gratis desde $30.000 CLP

Se cambian en `index.js` (`ENVIO_FIJO`, el umbral en `checkout`) y en
`assets/js/config.js` (`checkout.envioFijo`, `checkout.envioGratisDesde`). El valor
del servidor manda; el del navegador es solo la pantalla.

## Pruebas

```bash
npm run test:api
```

40 pruebas sin red ni credenciales: firmas (incluye rechazo de firmas manipuladas y
replay), calculo de total, rechazo de precios falseados, idempotencia de webhooks y
proteccion del panel. La firma de Mercado Pago se verifica con el manifiesto real,
incluido el caso del `data.id` duplicado que se olvida y rompe la integracion.

## La compra al proveedor es manual

La API de AliExpress es de **solo lectura**. No permite crear pedidos. Lo hacen
DSers u Oberlo, con acuerdos privileged que no se replican con una API key propia.

El flujo real es:

1. Entras a `panel.html` con tu clave
2. Ves el pedido pagado, con la direccion del cliente y el link del proveedor
3. Compras tu en AliExpress con la direccion del cliente (compra directa a proveedor)
4. Pegas el tracking en el panel

Costo por venta: lo que pagas en AliExpress (normalmente 20-40% del precio de venta)
mas la pasarela (~3.5% + $0.30 USD en MP). El margen va en que el markup sea
suficiente: si compras a $12 y vendes a $25, te quedan ~$10 antes de la pasarela.

Si necesitas automatizar la compra, las dos salidas son migrar el catalogo a CJ
Dropshipping (su API si permite crear pedidos, previa aprobacion como vendedor) o
pagar DSers. Ninguna es gratis, y ninguna es un simple cambio de codigo.
