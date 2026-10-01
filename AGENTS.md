# Contexto para asistentes

Este repositorio es un catalogo de dropshipping estatico. Todo el trabajo —crear,
desarrollar, mantener— ocurre aqui.

## Que es y que no es

- Es HTML + CSS + JavaScript plano. No hay framework, ni bundler, ni paso de build,
  ni `node_modules` en tiempo de ejecucion. No anadas dependencias de frontend.
- Node.js existe para servir la pagina en local (`npm start`), correr las pruebas
  (`npm test`, `npm run test:api`) y sincronizar el catalogo.
- La tienda es un cliente sin backend: el carrito vive en `localStorage`. El backend
  es el Worker en `api/`, que existe solo para cobrar y registrar pedidos.

## Estructura en dos partes

```
raiz/     sitio estatico: HTML, CSS, JS de cliente, data/productos.json
api/      Cloudflare Worker: checkout, webhooks, emails, D1
```

El Worker es la unica autoridad sobre el precio. `data/productos.json` es lo que el
navegador muestra; la tabla `productos` en D1 es lo que se cobra. Si divergen, el
cliente ve una cifra y paga otra. `npm test` verifica que coincidan, asi que si
cambias precios, cambialos en los dos lados o regenera `api/precios.sql` con `npm run sync`.

## Comandos

```bash
npm start          # sitio estatico en http://localhost:5173
npm test           # sitio: datos, carrito, helpers, coherencia de precios
npm run test:api   # Worker: firmas, calculo de total, webhooks, idempotencia
npm run sync:dry   # trae productos del proveedor y los muestra, sin escribir
npm run sync       # idem y escribe data/productos.json + api/precios.sql
```

En `api/`: `npx wrangler dev` levanta el Worker en 8787, y
`npx wrangler d1 execute ascua --local --file=./schema.sql` crea la base local.

Para `sync` hacen falta variables de entorno: `PROVEEDOR`, `PROVEEDOR_KEY`,
`PROVEEDOR_URL` opcional, `PROVEEDOR_LIMITE` opcional.

## Reglas de seguridad del Worker

No son preferencias: son la linea entre cobrar y regalar el producto.

1. **Nunca confies en el precio que manda el cliente.** El navegador envia `id` y
   `cantidad`; el Worker busca el precio en la tabla `productos`. Si alguien edita
   el total, el pedido se rechaza.
2. **Nunca aceptes un webhook sin verificar la firma.** MP usa `x-signature` con
   el manifiesto `id:...;data.id:...;ts:...;`; Flow usa `x-flow-signature` sobre
   `timestamp + cuerpo`. Ventana de 5 minutos contra reenvios.
3. **El total se guarda ya resuelto.** Si manana subes un precio, lo que cobraste
   ayer no se mueve.
4. **Los reenvios no reenvian emails.** `tomarPedido` solo devuelve pedidos en
   estado `pendiente`, asi que la segunda notificacion es un no-op.
5. **Las claves van como secrets de wrangler, nunca en `[vars]`.** Usa
   `wrangler secret put`.
6. **No filtres datos de la pasarela al cliente.** Ante error, mensaje generico.

## Reglas de arquitectura

1. **La capa de datos es `assets/js/api.js` y nadie mas.** Si una funcion nueva
   necesita saber de donde viene un producto, va ahi. El resto de la tienda consume
   `TiendaAPI.obtenerCatalogo()` y trabaja con objetos ya normalizados. Nunca llames
   APIs con credenciales desde el navegador.
2. **Normaliza en el borde.** Todo producto, venga de donde venga, debe quedar con
   estos campos: `id`, `nombre`, `descripcion`, `precio`, `precioComparacion`,
   `imagen`, `imagenes`, `categoria`, `etiquetas`, `stock`, `envioDias`, `rating`,
   `ventas`, `proveedor`, `sku`, `urlOrigen`.
3. **Sin innerHTML con datos sin escapar.** Todo texto que venga del catalogo pasa
   por `UI.escapar`. Las URLs de imagen pasan por `UI.imagenSegura`, que rechaza
   `javascript:` y rutas sospechosas. Si agregas un campo nuevo al render, cuidalo.
4. **Estilos en una sola hoja.** `assets/css/estilos.css`, con los valores de color y
   espaciado como tokens en `:root`. No anadas hojas nuevas ni frameworks de CSS.
5. **Sin build.** Si el proyecto necesita un paso de compilacion para funcionar,
   la solucion esta equivocada. El sitio se sube a hosting tal cual.

## Convenciones

- Spanish en codigo, comentarios, HTML y textos de interfaz. Sin tildes en nombres de
  archivo ni de funcion, para no romper URLs ni comandos.
- Clases CSS en kebab-case (`tarjeta__titulo`), funciones en camelCase.
- Sin `var`. Usa `const` por defecto y `let` solo cuando reasignas.
- Comentarios solo cuando explican el "por que", no el "que".
- Responsive obligatorio: revisa el resultado a 360px antes de dar algo por terminado.
- Accesibilidad: todo elemento interactivo con estado de foco visible, botones
  disabled cuando no aplica, y `aria-label` en botones solo con icono.

## Al terminar un cambio

- Corre `npm test` y `npm run test:api`. Si algo falla, eso va primero.
- Abre la pagina con `npm start` y confirma que el catalogo carga, que los filtros y
  la busqueda responden, y que agregar al carrito actualiza el contador.
- Si tocaste `data/productos.json` o la capa de datos, prueba tambien `producto.html`.
- Si tocaste precios, revisa que `npm test` siga diciendo que coinciden con D1.
- Si agregaste campos al modelo de producto, actualiza la lista de campos en
  `README.md` y en `scripts/sync-productos.mjs`.
