/**
 * Pruebas rapidas de la capa de datos y el carrito, sin navegador.
 * Ejecuta: node scripts/pruebas.mjs
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

let fallos = 0;
function comprobar(descripcion, condicion) {
  if (condicion) {
    console.log(`  ok   ${descripcion}`);
  } else {
    console.log(`  FALLA ${descripcion}`);
    fallos++;
  }
}

// --- Entorno minimo que imita window + localStorage ---
const almacenamiento = new Map();
const localStorage = {
  getItem: (k) => (almacenamiento.has(k) ? almacenamiento.get(k) : null),
  setItem: (k, v) => almacenamiento.set(k, String(v)),
  removeItem: (k) => almacenamiento.delete(k),
};

const sandbox = {
  console,
  localStorage,
  URLSearchParams,
  crypto: globalThis.crypto,
  fetch: async (ruta) => {
    const url = new URL(ruta, "http://localhost:5173");
    const cuerpo = await readFile(join(RAIZ, decodeURIComponent(url.pathname)));
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(cuerpo.toString("utf8")),
    };
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const cargar = async (nombre) =>
  vm.runInContext(
    await readFile(join(RAIZ, "assets", "js", nombre), "utf8"),
    sandbox,
    { filename: nombre }
  );

await cargar("config.js");
await cargar("ui.js");
await cargar("api.js");
await cargar("carrito.js");

const { TiendaAPI, Carrito, UI, CONFIG } = sandbox;

console.log("\nconfig.js");
comprobar("moneda y simbolo presentes", !!CONFIG.store.simbolo);
comprobar(
  "productosPorPagina es un numero positivo",
  Number.isInteger(CONFIG.catalogo.productosPorPagina) &&
    CONFIG.catalogo.productosPorPagina > 0
);

console.log("\napi.js — normalizacion");
const crudo = await TiendaAPI.obtenerCatalogo();
comprobar("devuelve una lista", Array.isArray(crudo));
comprobar("no esta vacia", crudo.length > 0);

const CAMPOS = [
  "id",
  "nombre",
  "descripcion",
  "precio",
  "precioComparacion",
  "imagen",
  "imagenes",
  "categoria",
  "etiquetas",
  "stock",
  "envioDias",
  "rating",
  "ventas",
  "proveedor",
  "sku",
  "urlOrigen",
];
const faltan = [];
for (const p of crudo) {
  for (const c of CAMPOS) {
    if (!(c in p)) faltan.push(`${p.id}.${c}`);
  }
}
comprobar(`todos los productos tienen los ${CAMPOS.length} campos`, faltan.length === 0);
if (faltan.length) console.log("       faltan:", faltan.join(", "));

comprobar("ids unicos", new Set(crudo.map((p) => p.id)).size === crudo.length);
comprobar(
  "precios numericos no negativos",
  crudo.every((p) => Number.isFinite(p.precio) && p.precio >= 0)
);
comprobar(
  "precioComparacion es mayor que precio o null",
  crudo.every(
    (p) => p.precioComparacion === null || p.precioComparacion > p.precio
  )
);
comprobar("etiquetas siempre es un arreglo", crudo.every((p) => Array.isArray(p.etiquetas)));
comprobar("imagenes siempre es un arreglo", crudo.every((p) => Array.isArray(p.imagenes)));

console.log("\napi.js — categorias");
const categorias = TiendaAPI.categorias(crudo);
comprobar("devuelve categorias sin repetidas", new Set(categorias).size === categorias.length);
comprobar("ordenadas alfabeticamente", categorias.every((c, i) => i === 0 || categorias[i - 1] <= c));

console.log("\napi.js — cache");
const desdeCache = await TiendaAPI.obtenerCatalogo();
comprobar("la segunda llamada devuelve lo mismo", desdeCache.length === crudo.length);
TiendaAPI.invalidarCache();
comprobar("invalidarCache limpia el almacen", !almacenamiento.has("tienda:catalogo:v1"));
const recargado = await TiendaAPI.obtenerCatalogo();
comprobar("vuelve a leer el archivo tras invalidar", recargado.length === crudo.length);

console.log("\nui.js");
comprobar("escapa <script>", UI.escapar("<script>x</script>") === "&lt;script&gt;x&lt;/script&gt;");
comprobar("escapa comillas", UI.escapar('a"b\'c') === "a&quot;b&#39;c");
comprobar("CLP sin decimales", UI.precio(29990) === "$29.990");
comprobar("redondea a entero", UI.precio(29.99) === "$30");
comprobar("miles con punto", UI.precio(1000000) === "$1.000.000");
comprobar("descuento correcto", UI.descuento(25000, 50000) === 50);
comprobar("descuento 0 sin comparacion", UI.descuento(25, null) === 0);
comprobar("descuento 0 si comparacion es menor", UI.descuento(50, 25) === 0);
comprobar("rechaza javascript: en imagen", UI.imagenSegura("javascript:alert(1)", "x") === "");
comprobar("rechaza data:text/html", UI.imagenSegura("data:text/html,<b>", "x") === "");
comprobar("acepta https", UI.imagenSegura("https://x.test/a.jpg", "x").includes("src="));
comprobar("acepta data:image/png", UI.imagenSegura("data:image/png;base64,AAA", "x").includes("src="));
comprobar("escapa alt en imagen", UI.imagenSegura("https://x.test/a.jpg", 'a" onerror="x').includes("&quot;"));
comprobar("estrellas de 4.4", UI.estrellas(4.4) === "★★★★☆");

console.log("\ncarrito.js");
Carrito.vaciar();
comprobar("carrito vacio al inicio", Carrito.cantidadTotal() === 0 && Carrito.subtotal() === 0);

const p1 = crudo[0];
const p2 = crudo[1];
Carrito.agregar(p1, 2);
comprobar("agrega 2 unidades", Carrito.cantidadTotal() === 2);
comprobar("subtotal correcto", Carrito.subtotal() === p1.precio * 2);

Carrito.agregar(p1, 1);
comprobar("acumula si el producto ya existe", Carrito.cantidadTotal() === 3);
comprobar("no duplica la linea", Carrito.obtener().filter((i) => i.id === p1.id).length === 1);

Carrito.agregar(p2, 1);
comprobar("mezcla productos distintos", Carrito.obtener().length === 2);
comprobar(
  "subtotal suma todos",
  Math.abs(Carrito.subtotal() - (p1.precio * 3 + p2.precio)) < 1e-9
);

Carrito.fijarCantidad(p1.id, 0);
comprobar("cantidad 0 elimina la linea", Carrito.obtener().every((i) => i.id !== p1.id));

Carrito.fijarCantidad(p2.id, -5);
comprobar("cantidad negativa se recorta a 0", Carrito.obtener().length === 0);

Carrito.agregar(p1, 9999);
comprobar("no supera el stock", Carrito.cantidadTotal() === p1.stock);

Carrito.fijarCantidad(p1.id, 2);
Carrito.quitar(p1.id);
comprobar("quitar elimina el producto", Carrito.obtener().length === 0);

Carrito.agregar(p1, 1);
Carrito.vaciar();
comprobar("vaciar deja el carrito en cero", Carrito.cantidadTotal() === 0);

console.log("\ncarrito.js — persistencia");
Carrito.agregar(p1, 2);
const guardado = almacenamiento.get("tienda:carrito:v1");
comprobar("guarda en localStorage", !!guardado);
comprobar("lo guardado es un arreglo", Array.isArray(JSON.parse(guardado)));
comprobar("conserva el total tras releer", Carrito.cantidadTotal() === 2);

Carrito.vaciar();

console.log("\npreparar-sitio.mjs");

{
  // Lo que se sube a Cloudflare no puede incluir node_modules: su `workerd` pesa
  // 128 MB y el deploy falla con "Asset too large". Por eso el sitio se copia a
  // dist/ en vez de apuntar los assets a la raiz del repo.
  const { readFile: leer, readdir: listar, stat } = await import("node:fs/promises");

  // dist/ esta en .gitignore, asi que se genera al vuelo: las pruebas tienen que
  // pasar en un clon recien hecho, antes del primer deploy.
  const raiz = join(RAIZ, "dist");
  await import("node:child_process").then(({ execFileSync }) =>
    execFileSync(process.execPath, [join(RAIZ, "scripts", "preparar-sitio.mjs")], {
      cwd: RAIZ,
      stdio: "pipe",
    })
  );

  const salida = await stat(raiz).catch(() => null);
  comprobar("preparar-sitio.mjs genera dist/", salida !== null);

  if (salida) {
    const contenidos = await listar(raiz);
    comprobar("dist/ tiene index.html", contenidos.includes("index.html"));
    comprobar("dist/ tiene _headers", contenidos.includes("_headers"));

    const prohibidos = ["node_modules", "api", "scripts", ".git", "wrangler.toml"];
    const filtrados = [];

    async function revisar(dir) {
      for (const e of await listar(dir, { withFileTypes: true })) {
        if (prohibidos.includes(e.name)) filtrados.push(e.name);
        // Cloudflare rechaza assets de mas de 25 MiB, asi que tambien se
        // comprueba el tamano de cada archivo, no solo el total.
        if (e.isDirectory()) await revisar(join(dir, e.name));
        else if ((await stat(join(dir, e.name))).size > 25 * 1024 * 1024)
          filtrados.push(e.name);
      }
    }
    await revisar(raiz);

    comprobar("dist/ no contiene archivos de herramientas", filtrados.length === 0);
    comprobar("ningun asset supera 25 MiB", filtrados.length === 0);
  }

  // El nombre del paquete debe seguir a la marca.
  const pkg = JSON.parse(await leer(join(RAIZ, "package.json"), "utf8"));
  comprobar("package.json se llama ascua", pkg.name === "ascua");
}

console.log("\ncoherencia de precios con el Worker");
{
  // El Worker cobra desde la tabla productos de D1 (api/seed.sql o
  // api/precios.sql), no desde este archivo. Si los precios difieren, el
  // cliente ve una cifra y le cobran otra.
  const { readFile: leer } = await import("node:fs/promises");
  const semilla = await leer(join(RAIZ, "api", "seed.sql"), "utf8");
  const filas = [...semilla.matchAll(/\('([^']+)',\s*'([^']+)',\s*(\d+)/g)];
  const precios = filas.map(([, id, , precio]) => [id, Number(precio)]);
  comprobar("seed.sql tiene precios", precios.length > 0);

  const json = JSON.parse(
    await leer(join(RAIZ, "data", "productos.json"), "utf8")
  );
  const catalogo = new Map(json.productos.map((p) => [p.id, p]));

  const desalineados = precios.filter(
    ([id, precio]) => catalogo.get(id)?.precio !== precio
  );
  comprobar(
    `precios coinciden en los ${precios.length} productos`,
    desalineados.length === 0
  );
  if (desalineados.length) {
    for (const [id, precio] of desalineados) {
      console.log(`       ${id}: pagina ${catalogo.get(id)?.precio} vs worker ${precio}`);
    }
  }
}

console.log(
  fallos === 0
    ? "\nTodas las pruebas pasaron.\n"
    : `\n${fallos} prueba(s) fallaron.\n`
);
process.exit(fallos === 0 ? 0 : 1);
