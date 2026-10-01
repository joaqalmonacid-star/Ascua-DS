/**
 * Firmas de webhook. Si esto falla, cualquiera que conozca la URL puede
 * mandarte un "pago aprobado" inventado y entregar productos gratis.
 */

/** Convierte texto a bytes con la codificacion que exige cada firma. */
function aUtf8(texto) {
  return new TextEncoder().encode(texto);
}

function aHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(secret, mensaje) {
  const clave = await crypto.subtle.importKey(
    "raw",
    aUtf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return aHex(await crypto.subtle.sign("HMAC", clave, aUtf8(mensaje)));
}

/** Comparacion en tiempo constante: no filtra informacion por temporizacion. */
function igual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Mercado Pago envia x-signature: "ts=1700000000,v1=abc..." y x-request-id.
 * El manifiesto ordena las claves alfabeticamente e incluye data.id
 * duplicado, que es un detalle que se olvida y rompe toda la validacion.
 */
export async function verificarMercadoPago(request, cuerpo, secreto) {
  if (!secreto) return { ok: false, motivo: "MP_WEBHOOK_SECRET no configurado" };

  const firma = request.headers.get("x-signature");
  if (!firma) return { ok: false, motivo: "falta x-signature" };

  const partes = Object.fromEntries(
    firma.split(",").map((p) => p.split("=").map((s) => s.trim()))
  );
  if (!partes.ts || !partes.v1) {
    return { ok: false, motivo: "x-signature mal formada" };
  }

  // Ventana de 5 minutos: sin esto, una firma capturada se reutiliza para siempre.
  const antiguedad = Math.abs(Date.now() / 1000 - Number(partes.ts));
  if (!Number.isFinite(antiguedad) || antiguedad > 300) {
    return { ok: false, motivo: "firma expirada" };
  }

  let datos = {};
  try {
    datos = JSON.parse(cuerpo);
  } catch (e) {
    return { ok: false, motivo: "cuerpo no es JSON" };
  }

  const id = request.headers.get("x-request-id") || datos.id;
  let manifiesto;
  if (id) {
    // Si el id es alfanumerico, MP espera las dos claves.
    manifiesto = /^[a-z0-9]+$/i.test(id)
      ? `id:${id};data.id:${id};ts:${partes.ts};`
      : `id:${id};ts:${partes.ts};`;
  } else {
    manifiesto = `ts:${partes.ts};`;
  }

  const esperada = await hmac(secreto, manifiesto);
  return igual(esperada, partes.v1)
    ? { ok: true, id }
    : { ok: false, motivo: "firma no coincide" };
}

/**
 * Flow envia x-flow-signature y x-flow-signature-timestamp. Firma el
 * timestamp concatenado con el cuerpo, en ese orden.
 */
export async function verificarFlow(request, cuerpo, secreto) {
  if (!secreto) return { ok: false, motivo: "FLOW_SECRET_KEY no configurado" };

  const firma = request.headers.get("x-flow-signature");
  const ts = request.headers.get("x-flow-signature-timestamp");
  if (!firma || !ts) return { ok: false, motivo: "faltan cabeceras de Flow" };

  const antiguedad = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(antiguedad) || antiguedad > 300) {
    return { ok: false, motivo: "firma expirada" };
  }

  const esperada = await hmac(secreto, `${ts}${cuerpo}`);
  return igual(esperada, firma)
    ? { ok: true, id: null }
    : { ok: false, motivo: "firma no coincide" };
}
