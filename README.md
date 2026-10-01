# Ascua

Tienda de dropshipping para Chile. Catalogo estatico (HTML, CSS y JavaScript sin
frameworks ni build) mas un Worker de Cloudflare que cobra con Mercado Pago y Flow.

Los productos se cargan desde `public/data/productos.json`, que puede generarse desde la API
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
ascua/
├── wrangler.toml            Config de deploy. Va en la raiz a proposito (ver Despliegue)
├── public/                  El sitio, tal cual lo sirve Cloudflare
│   ├── index.html           Catalogo: hero, filtros, busqueda, orden, rejilla
│   ├── producto.html        Ficha de producto (lee ?id=)
│   ├── checkout.html        Datos del comprador y eleccion de pasarela
│   ├── gracias.html         Retorno del pago
│   ├── panel.html           Pedidos, aviso de envio y tracking
│   ├── _headers             Cabeceras de seguridad y cache (formato Cloudflare)
│   ├── assets/
│   │   ├── css/estilos.css  Estilos unicos, con tokens al inicio
│   │   └── js/
│   │       ├── config.js       Configuracion de negocio, moneda y proveedores
│   │       ├── ui.js           Helpers de presentacion (precio, escape, toast)
│   │       ├── api.js          Capa de datos del cliente
│   │       ├── carrito.js      Carrito en localStorage
│   │       ├── carrito-panel.js  Panel lateral del carrito
│   │       ├── app.js          Logica del catalogo
│   │       ├── producto.js     Logica de la ficha
│   │       ├── checkout.js     Envio del pedido al Worker
│   │       ├── gracias.js      Estado tras el pago
│   │       └── panel.js        Panel de pedidos
│   └── data/productos.json  Catalogo que muestra la pagina
├── api/                     Worker de Cloudflare (checkout, webhooks, D1)
│   ├── src/                 Codigo del Worker
│   ├── schema.sql           Tablas de D1
│   └── README.md            Guia de puesta en marcha del checkout
└── scripts/                 Solo desarrollo, nunca se despliega
    ├── dev-server.mjs       Servidor estatico (sin dependencias)
    ├── pruebas.mjs          Pruebas del sitio
    └── sync-productos.mjs   Trae productos de un proveedor
```

## Dónde cambiar las cosas

| Necesitas cambiar | Edita |
| --- | --- |
| Nombre, moneda, email de la tienda | `public/assets/js/config.js` → `store` |
| Cuántos productos se muestran por tanda | `public/assets/js/config.js` → `catalogo.productosPorPagina` (el botón "Cargar más" añade otra tanda) |
| Cuánto dura la cache del navegador | `public/assets/js/config.js` → `catalogo.cacheMinutos` |
| Colores, tipografia, radios | `public/assets/css/estilos.css` → bloque `:root` |
| Productos | `public/data/productos.json` |
| Precios que se cobran de verdad | tabla `productos` en D1, no el JSON |

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
npm run sync         # escribe public/data/productos.json
```

3. Revisa `public/data/productos.json` y recarga la pagina.

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

Un solo despliegue publica el sitio y la API, porque `wrangler.toml` declara
`[assets] directory = "./public"` y sirve las paginas estaticas desde el mismo
Worker. El sitio y la API quedan en el mismo dominio, asi que no hay CORS ni dos
URLs que mantener.

```bash
npx wrangler deploy
```

Sin paso previo. Sigue sin haber build: no hay bundler, ni compilación, ni script
de copia. `public/` se sube tal cual.

### Por qué `wrangler.toml` está en la raíz

Cloudflare ejecuta el deploy desde la raíz del repositorio. Si no encuentra un
`wrangler.toml` ahí, wrangler genera uno solo que toma **la raíz entera** como
directorio de assets. Como el propio deploy instala wrangler, eso arrastra el
`node_modules/workerd` de 128 MB y el deploy muere con:

```
✘ [ERROR] Asset too large.
  file node_modules/workerd/bin/workerd with a size of 128 MiB
```

Poner el archivo en la raíz hace que `npx wrangler deploy` funcione sin configuración
adicional, y `[assets] directory = "./public"` garantiza que a `public/` solo va lo
que el navegador necesita. Es la diferencia entre 2.090 archivos y 18.

### Configuración en el panel de Cloudflare

Con el layout actual, los valores por defecto ya funcionan:

| Campo | Valor |
| --- | --- |
| Build command | *(dejar vacío)* |
| Deploy command | `npx wrangler deploy` |
| Root directory | *(dejar vacío)* |

No necesitas build command: el repositorio no tiene nada que compilar. Si alguna
vez lo tuvieras, recuerda que `cd api` ya no hace falta, porque la configuración se
lee desde la raíz.

Lo que sí hay que revisar en el panel son las **Variables** y el **Binding** de D1,
porque en los builds de Cloudflare no se leen del `wrangler.toml`. Ver
`api/README.md`.

Si prefieres el sitio en otro hosting (Netlify, Vercel, GitHub Pages, S3), sube el
contenido de `public/` tal cual y despliega solo el Worker con
`npx wrangler deploy --assets=./nada`. En ese caso pon `checkout.apiUrl` en
`public/assets/js/config.js` con la URL del Worker, y `CORS_ORIGIN` en
`wrangler.toml` con el dominio del sitio.
