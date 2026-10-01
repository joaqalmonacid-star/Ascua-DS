/**
 * Flow (Chile). Docs: https://developers.flow.cl/
 * Flow trabaja con APIs REST y firma de webhook distinta a MP.
 */

const BASE_PRODUCCION = "https://api.flow.cl";
const BASE_SANDBOX = "https://sandbox.flow.cl";

async function llamar(base, ruta, opciones = {}) {
  const res = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: {
      "content-type": "application/json",
      ...opciones.headers,
    },
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = datos.message || JSON.stringify(datos);
    throw new Error(`Flow ${ruta} -> HTTP ${res.status}: ${detalle}`);
  }
  return datos;
}

/**
 * Flow exige firma HMAC en algunos endpoints (crear pago), y la firma en
 * webhook es x-flow-signature-timestamp + cuerpo.
 */
function formatearParametros(obj) {
  return Object.keys(obj)
    .sort()
    .map((k) => `${k}=${obj[k]}`)
    .join("&");
}

export async function crearPagoFlow({
  apiKey,
  secretKey,
  pedido,
  origen,
  sandbox = false,
}) {
  const base = sandbox ? BASE_SANDBOX : BASE_PRODUCCION;
  const ts = Math.floor(Date.now() / 1000);

  const parametros = {
    apiKey,
    commerceOrder: pedido.id,
    subject: "Compra en Ascua",
    currency: "CLP",
    amount: pedido.total,
    paymentMethod: 1, // Debito/Credito
    email: pedido.email,
    name: pedido.nombre.slice(0, 80),
    urlRedirect: `${origen}/gracias.html?pedido=${pedido.id}`,
    urlReturn: `${origen}/gracias.html?pedido=${pedido.id}`,
    urlConfirmation: `${origen}/api/webhook/flow`,
    optional: JSON.stringify({
      telefono: pedido.telefono || "",
      documento: pedido.documento || "",
    }),
  };

  const firma = await hmac(secretKey, `${ts}${formatearParametros(parametros)}`);

  const body = new URLSearchParams({
    ...parametros,
    s: firma,
    t: String(ts),
  });

  const res = await fetch(`${base}/api/payment/create`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = datos.message || datos.response || JSON.stringify(datos);
    throw new Error(`Flow create -> HTTP ${res.status}: ${detalle}`);
  }
  return datos; // trae url (link) o paymentId
}

export async function obtenerPagoFlow({ apiKey, secretKey, flowOrder, sandbox = false }) {
  const base = sandbox ? BASE_SANDBOX : BASE_PRODUCCION;
  const ts = Math.floor(Date.now() / 1000);
  const p = { apiKey, flowOrder };
  const firma = await hmac(secretKey, `${ts}${formatearParametros(p)}`);
  const url = `${base}/api/payment/get?apiKey=${apiKey}&flowOrder=${flowOrder}&s=${firma}&t=${ts}`;
  const res = await fetch(url);
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return datos;
}

async function hmac(secret, mensaje) {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(mensaje)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
