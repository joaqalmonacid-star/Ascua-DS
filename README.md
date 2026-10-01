# Ascua

Tienda de dropshipping para Chile. Catalogo estatico (HTML, CSS y JavaScript sin
frameworks ni build) mas un Worker de Cloudflare que cobra con Mercado Pago y Flow.

Los productos se cargan desde `data/productos.json`, que puede generarse desde la API
de un proveedor con `npm run sync`.

## Requisitos

- Node.js 18 o superior (solo para el servidor local y el script de sincronizacion)
- Un navegador moderno

## Puesta en marcha

```bash
cd Documents/tienda-dropshipping
npm start          # levanta http://localhost:5173
npm test           # pruebas de datos, carrito y helpers de interfaz
```

Abre <http://localhost:5173>. No abras `index.html` con doble clic: la pagina necesita
`fetch` para leer el JSON, y eso falla con el protocolo `file://`.

## Estructura

```
tienda-dropshipping/
├── index.html              Catalogo: hero, filtros, busqueda, orden, rejilla
├── producto.html           Ficha de producto (lee ?id=)
├── checkout.html           Datos del comprador y eleccion de pasarela
├── gracias.html            Retorno del pago
├── panel.html              Pedidos, aviso de envio y tracking
├── assets/
│   ├── css/estilos.css     Estilos unicos, con tokens al inicio
│   └── js/
│       ├── config.js       Configuracion de negocio, moneda y proveedores
│       ├── ui.js           Helpers de presentacion (precio, escape, toast)
│       ├── api.js          Capa de datos del cliente
│       ├── carrito.js      Carrito en localStorage
│       ├── carrito-panel.js  Panel lateral del carrito
│       ├── app.js          Logica del catalogo
│       ├── producto.js     Logica de la ficha
│       ├── checkout.js     Envio del pedido al Worker
│       ├── gracias.js      Estado tras el pago
│       └── panel.js        Panel de pedidos
├── data/productos.json     Catalogo que muestra la pagina
├── scripts/
│   ├── dev-server.mjs      Servidor estatico de desarrollo (sin dependencias)
│   ├── preparar-sitio.mjs  Copia el sitio a dist/ para publicar
│   ├── pruebas.mjs         Pruebas del sitio
│   └── sync-productos.mjs  Trae productos de un proveedor
└── api/                    Worker de Cloudflare (checkout, webhooks, D1)
    └── README.md           Guia de puesta en marcha del checkout
```

## Dónde cambiar las cosas

| Necesitas cambiar | Edita |
| --- | --- |
| Nombre, moneda, email de la tienda | `assets/js/config.js` → `store` |
| Cuántos productos se muestran por tanda | `assets/js/config.js` → `catalogo.productosPorPagina` (el botón "Cargar más" añade otra tanda) |
| Cuánto dura la cache del navegador | `assets/js/config.js` → `catalogo.cacheMinutos` |
| Colores, tipografia, radios | `assets/css/estilos.css` → bloque `:root` |
| Productos | `data/productos.json` |

## Conectar un proveedor (AliExpress, CJ, etc.)

Una pagina estatica no puede llamar APIs con credenciales desde el navegador: la clave
quedaria expuesta y casi todas las APIs de proveedores bloquean el CORS. Por eso la
tienda lee un JSON y el script de Node hace la llamada autenticada.

1. Consigue las credenciales del proveedor (RapidAPI para AliExpress, cuenta CJ para CJ).
2. En PowerShell:

```powershell
$env:PROVEEDOR='aliexpress'
$env:PROVEEDOR_KEY='tu-clave'
$env:PROVEEDOR_LIMITE='50'
npm run sync:dry     # vista previa, no escribe nada
npm run sync         # escribe data/productos.json
```

3. Revisa `data/productos.json` y recarga la pagina.

Si la respuesta del proveedor tiene una forma distinta a la esperada, ajusta la funcion
`mapearAliExpress` o `mapearCJ` en `scripts/sync-productos.mjs`. Todos los campos que
usa la tienda son:

```
id, nombre, descripcion, precio, precioComparacion, imagen, imagenes,
categoria, etiquetas[], stock, envioDias, rating, ventas, proveedor, sku, urlOrigen
```

## Estado actual

Listo: catalogo, busqueda con retardo, filtro por categoria, orden por precio/puntuacion/
nombre, carga por tandas con "Cargar mas", ficha de producto con galeria y selector de
cantidad, carrito lateral en ambas paginas y persistido en `localStorage`, diseno
responsive, navegacion por teclado y estados vacios.

Checkout completo: pagina de pago, cobro con Mercado Pago y Flow, validacion de firma
en los webhooks de ambas, registro de pedidos en D1, aviso por email a ti y al cliente,
y panel para ver pedidos, comprar al proveedor y pegar el tracking. Ver
`api/README.md` para los pasos de puesta en marcha.

Precios en CLP sin decimales, envio $3.990, gratis desde $30.000.

**La compra al proveedor es manual.** La API de AliExpress es de solo lectura y no
crea pedidos; eso lo hacen DSers u Oberlo, con acuerdos que no se replican con una API
key propia. El panel esta armado para que copies la direccion, compres en AliExpress
y pegues el tracking.

Pendiente: sincronizacion automatica (un cron que corra `sync` y cargue
`api/precios.sql`), avisos automaticos de estado de envio, y SEO con datos
estructurados (el sitio es SPA sin render en servidor, asi que el SEO de detalle de
producto mejorara al migrar a un generador estatico o a Next.js).

## Despliegue

Un solo despliegue publica el sitio y la API, porque `api/wrangler.toml` declara
`[assets] directory = "../dist"` y sirve las paginas estaticas desde el mismo Worker.
El sitio y la API quedan en el mismo dominio, asi que no hay CORS ni dos URLs que
mantener.

```bash
node scripts/preparar-sitio.mjs     # copia el sitio a dist/
cd api && npx wrangler deploy
```

Sigue sin haber build: `preparar-sitio.mjs` copia archivos, no compila. Existe
porque Cloudflare sube **todo** lo que hay en el directorio de assets, y si ese
directorio es la raiz del repositorio, el `node_modules/workerd` de 128 MB que crea
la propia instalacion de wrangler acaba subido como si fuera del sitio y el deploy
falla con `Asset too large`.

Desde GitHub, el build command es
`node scripts/preparar-sitio.mjs && cd api && npx wrangler deploy`. El `cd api` no es
opcional. Ver `api/README.md` para el detalle.

Si prefieres el sitio en otro hosting (Netlify, Vercel, GitHub Pages, S3), sube el
contenido de la raiz tal cual, incluyendo `data/`, y despliega solo el Worker desde
`api/`. En ese caso pon `checkout.apiUrl` en `assets/js/config.js` con la URL del
Worker, y `CORS_ORIGIN` en `wrangler.toml` con el dominio del sitio.
