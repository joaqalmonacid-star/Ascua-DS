/**
 * Servidor estatico minimo para desarrollo. No hay dependencias: el sitio es
 * HTML plano y solo necesita servir archivos con los tipos MIME correctos.
 *
 *   node scripts/dev-server.mjs [puerto]
 *
 * Sirve `public/`, que es el mismo directorio que Cloudflare sube como assets.
 * Servir exactamente lo que se despliega evita que se developa algo que
 * despues no exista en produccion.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname, sep } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLICO = join(RAIZ, "public");
const PUERTO = Number(process.argv[2] || process.env.PORT || 5173);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let ruta = decodeURIComponent(url.pathname);
    if (ruta.endsWith("/")) ruta += "index.html";

    // Impide salir de public/ (..\..\etc\passwd).
    const destino = join(PUBLICO, normalize(ruta).replace(/^([/\\])+/, ""));
    if (!destino.startsWith(PUBLICO + sep) && destino !== PUBLICO) {
      res.writeHead(403).end("403 Prohibido");
      return;
    }

    const info = await stat(destino).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404 No encontrado");
      return;
    }

    const cuerpo = await readFile(destino);
    res.writeHead(200, {
      "content-type": TIPOS[extname(destino).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache",
      // Basicas de seguridad. Las de produccion van en public/_headers.
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
    });
    res.end(cuerpo);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`500 ${e.message}`);
  }
});

servidor.listen(PUERTO, () => {
  console.log(`Tienda disponible en http://localhost:${PUERTO}`);
  console.log("Ctrl+C para detener.");
});
