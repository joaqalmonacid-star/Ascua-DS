/**
 * Prepara el sitio para publicar: copia lo que el navegador necesita a `dist/`.
 *
 * Existe por un motivo concreto. Cloudflare sube como assets TODO lo que hay en
 * el directorio que se le indica, y cuando el deploy corre `npx wrangler`, la
 * propia instalacion de wrangler crea `node_modules/` con `workerd` (128 MB).
 * Si el directorio de assets es la raiz del repo, ese archivo sube tambien y el
 * deploy falla con "Asset too large".
 *
 * La solucion no es excluir archivos: es que `dist/` contenga solo el sitio. Es
 * un sitio sin build, asi que "compilar" es copiar.
 */

import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const DESTINO = join(RAIZ, "dist");

/** Lo unico que se publica. Todo lo demas del repo es herramienta. */
const COPIAR = ["assets", "data", "index.html", "producto.html", "checkout.html", "gracias.html", "panel.html"];

/** Cloudflare no acepta assets de mas de 25 MiB. Avisamos antes de subir. */
const LIMITE_BYTES = 25 * 1024 * 1024;

/**
 * Cabeceras de seguridad. `_headers` es un formato propio de Cloudflare: solo
 * funciona cuando los assets los sirve Cloudflare, no en el servidor local.
 */
const CABECERAS = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), microphone=(), camera=()

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/data/*
  Cache-Control: public, max-age=300

/*.html
  Cache-Control: public, max-age=0, must-revalidate
`;

async function main() {
  await rm(DESTINO, { recursive: true, force: true });
  await mkdir(DESTINO, { recursive: true });

  let archivos = 0;
  let bytes = 0;

  for (const entrada of COPIAR) {
    const origen = join(RAIZ, entrada);
    const info = await stat(origen).catch(() => null);

    if (!info) {
      console.error(`Falta ${entrada}. El sitio quedaria incompleto.`);
      process.exit(1);
    }

    await cp(origen, join(DESTINO, entrada), { recursive: true });

    const cuenta = await medir(origen);
    archivos += cuenta.archivos;
    bytes += cuenta.bytes;
  }

  await writeFile(join(DESTINO, "_headers"), CABECERAS, "utf8");
  archivos++;

  console.log(`dist/ preparado con ${archivos} archivos (${formatoBytes(bytes)}).`);

  if (bytes > LIMITE_BYTES) {
    console.error(
      `\nERROR: ${formatoBytes(bytes)} supera el limite de ${formatoBytes(LIMITE_BYTES)} por asset.\n` +
        "Revisa si algo grande se colaron en assets/ o data/."
    );
    process.exit(1);
  }

  console.log("Listo para desplegar. Archivos publicados:");
  for (const nombre of await readdir(DESTINO)) console.log(`  ${nombre}`);
}

async function medir(ruta) {
  const info = await stat(ruta);
  if (info.isFile()) return { archivos: 1, bytes: info.size };

  let archivos = 0;
  let bytes = 0;
  for (const entrada of await readdir(ruta)) {
    const sub = await medir(join(ruta, entrada));
    archivos += sub.archivos;
    bytes += sub.bytes;
  }
  return { archivos, bytes };
}

function formatoBytes(n) {
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});