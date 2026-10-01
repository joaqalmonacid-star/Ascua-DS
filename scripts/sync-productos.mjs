/**
 * Sincroniza el catalogo desde un proveedor y lo guarda en data/productos.json.
 * La pagina estatica nunca llama APIs con credenciales: este script lo hace
 * en Node, en tu maquina, y la tienda solo consume el JSON resultante.
 *
 * Uso:
 *   node scripts/sync-productos.mjs --dry          (solo muestra el resultado)
 *   node scripts/sync-productos.mjs                 (escribe el archivo)
 *
 * Variables de entorno:
 *   PROVEEDOR      aliexpress | cj  (default: aliexpress)
 *   PROVEEDOR_URL  endpoint del proveedor o de tu proxy
 *   PROVEEDOR_KEY  credencial del proveedor
 *   PROVEEDOR_LIMITE  cantidad maxima de productos (default 50)
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(aqui, "..");
const DESTINO = join(RAIZ, "data", "productos.json");

const dry = process.argv.includes("--dry");

const CONFIG = {
  aliexpress: {
    url:
      process.env.PROVEEDOR_URL ||
      "https://api.aliexpress.com/v1/products",
    mapear: mapearAliExpress,
  },
  cj: {
    url:
      process.env.PROVEEDOR_URL ||
      "https://api.cjdcropshipping.com/v2/products",
    mapear: mapearCJ,
  },
};

function aNumero(valor, porDefecto = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

function mapearAliExpress(p) {
  const precio = aNumero(p.salePrice ?? p.minPrice ?? p.price);
  return {
    id: String(p.productId ?? p.id ?? crypto.randomUUID()),
    nombre: String(p.productTitle ?? p.title ?? "Producto").trim(),
    descripcion: String(p.productDescription ?? p.description ?? "").trim(),
    precio,
    precioComparacion: aNumero(p.originalPrice) || null,
    imagen: p.productImage ?? p.mainImage ?? p.image ?? "",
    imagenes: Array.isArray(p.imageList) ? p.imageList : [],
    categoria: p.categoryName ?? p.category ?? "general",
    etiquetas: [],
    stock: aNumero(p.stock, 100),
    envioDias: aNumero(p.shipDays, 12),
    rating: aNumero(p.evaluation?.starRating, 4.5),
    ventas: aNumero(p.tradeCount ?? p.soldCount, 0),
    proveedor: "aliexpress",
    sku: String(p.productSku ?? ""),
    urlOrigen: p.productUrl ?? p.url ?? "",
  };
}

function mapearCJ(p) {
  const precio = aNumero(p.salePrice ?? p.price);
  return {
    id: String(p.productId ?? p.id ?? crypto.randomUUID()),
    nombre: String(p.name ?? p.title ?? "Producto").trim(),
    descripcion: String(p.description ?? "").trim(),
    precio,
    precioComparacion: aNumero(p.originPrice) || null,
    imagen: Array.isArray(p.imageSet) ? (p.imageSet[0]?.imageUrl ?? "") : p.image ?? "",
    imagenes: Array.isArray(p.imageSet)
      ? p.imageSet.slice(1, 5).map((i) => i.imageUrl)
      : [],
    categoria: p.categoryName ?? "general",
    etiquetas: [],
    stock: aNumero(p.stock, 100),
    envioDias: aNumero(p.deliveryTime, 10),
    rating: aNumero(p.rating, 4.5),
    ventas: aNumero(p.sales, 0),
    proveedor: "cj",
    sku: String(p.sku ?? ""),
    urlOrigen: p.url ?? p.originalUrl ?? "",
  };
}

async function main() {
  const nombre = (process.env.PROVEEDOR || "aliexpress").toLowerCase();
  const cfg = CONFIG[nombre];
  const key = process.env.PROVEEDOR_KEY;

  if (!cfg) {
    console.error(`Proveedor desconocido: ${nombre}`);
    console.error(`Disponibles: ${Object.keys(CONFIG).join(", ")}`);
    process.exit(1);
  }
  if (!key) {
    console.error("Falta PROVEEDOR_KEY. No se puede llamar al proveedor.");
    console.error("Ejemplo PowerShell:");
    console.error("  $env:PROVEEDOR_KEY='tu-clave'; $env:PROVEEDOR='aliexpress'; npm run sync");
    process.exit(1);
  }

  const limite = aNumero(process.env.PROVEEDOR_LIMITE, 50);
  const url = new URL(cfg.url);
  url.searchParams.set("limit", String(limite));
  url.searchParams.set("key", key);

  console.log(`Consultando ${nombre}: ${url.origin}${url.pathname} (limite ${limite})`);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    console.error(`El proveedor respondio HTTP ${res.status}`);
    process.exit(1);
  }

  const datos = await res.json();
  const lista = datos.products ?? datos.data ?? datos.items ?? datos.result ?? datos;
  if (!Array.isArray(lista)) {
    console.error("La respuesta del proveedor no trae una lista de productos.");
    console.error("Revisa la forma del JSON y ajusta CONFIG[proveedor] en este script.");
    process.exit(1);
  }

  const productos = lista.map(cfg.mapear);
  console.log(`${productos.length} productos recibidos de ${nombre}.`);

  if (dry) {
    console.log("Modo --dry: no se escribio nada. Vista previa:");
    console.log(JSON.stringify(productos.slice(0, 3), null, 2));
    return;
  }

  const actual = await readFile(DESTINO, "utf8").catch(() => "{}");
  const salida = actual.trim().startsWith("[") ? productos : { productos };
  await writeFile(DESTINO, JSON.stringify(salida, null, 2) + "\n", "utf8");
  console.log(`Guardado en data/productos.json (${productos.length} productos).`);

  // El Worker cobra desde la tabla productos de D1. Si esto no se actualiza,
  // la pagina muestra un precio y el servidor cobra otro.
  await escribirSql(salida.productos);
}

function escaparSql(valor) {
  return String(valor ?? "").replace(/'/g, "''");
}

async function escribirSql(productos) {
  const destino = join(RAIZ, "api", "precios.sql");
  const filas = productos
    .map(
      (p) =>
        `  ('${escaparSql(p.id)}', '${escaparSql(p.nombre)}', ${Math.round(p.precio)}, ` +
        `${p.stock}, '${escaparSql(p.sku)}', '${escaparSql(p.urlOrigen)}', 1)`
    )
    .join(",\n");

  const sql =
    `-- Generado por scripts/sync-productos.mjs. No editar a mano.\n` +
    `-- Cargar con:  cd api && npx wrangler d1 execute ascua --remote --file=./precios.sql\n` +
    `DELETE FROM productos;\n` +
    `INSERT OR REPLACE INTO productos (id, nombre, precio, stock, sku, url_origen, activo)\n` +
    `VALUES\n${filas};\n`;

  await writeFile(destino, sql, "utf8");
  console.log(
    `Generado api/precios.sql (${productos.length} precios).\n` +
    `  Carga la tabla que usa el Worker con:\n` +
    `    cd api && npx wrangler d1 execute ascua --remote --file=./precios.sql`
  );
}

main().catch((e) => {
  console.error("Error durante la sincronizacion:", e.message);
  process.exit(1);
});
