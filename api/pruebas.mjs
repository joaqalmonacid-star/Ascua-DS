/**
 * Pruebas del Worker: calculo de precios, validacion de firmas y transiciones
 * de pedido. Corre en Node sin levantar wrangler.
 *
 *   node api/pruebas.mjs
 */

import { verificarMercadoPago, verificarFlow } from "./src/firma.js";
import * as modPedidos from "./src/pedidos.js";
import worker from "./src/index.js";

/* ---------- Red simulada: las pruebas no llaman a Mercado Pago ni Flow ---------- */
globalThis.fetch = async (url) => {
  const href = typeof url === "string" ? url : String(url?.url ?? url);
  const json = (cuerpo, status = 200) =>
    new Response(JSON.stringify(cuerpo), {
      status,
      headers: { "content-type": "application/json" },
    });

  if (href.includes("mercadopago.com/checkout/preferences")) {
    return json(
      {
        id: "pref_test",
        init_point: "https://mp.test/pagar",
        sandbox_init_point: "https://mp.test/pagar-sandbox",
      },
      201
    );
  }
  if (href.includes("mercadopago.com/v3/payments")) {
    const id = href.split("/").pop();
    return json({
      id,
      status: "approved",
      // Asi lo devuelve MP de verdad: la preferencia viajaba con external_reference.
      external_reference: "asc_pagado",
      shipping: {
        receiver_name: "Cliente Test",
        street_name: "Av Siempre Viva",
        street_number: "742",
        city_name: "Santiago",
        state_name: "RM",
        zip_code: "1234567",
        country: { name: "Chile" },
        phone: { number: "+56912345678" },
        documentation: { number: "12345678-9" },
      },
    });
  }
  if (href.includes("flow.cl")) return json({ url: "https://flow.test/pagar" });
  if (href.includes("resend.com")) return json({ id: "email_1" });

  throw new Error(`Las pruebas no deben llamar a ${href}`);
};

let fallos = 0;
function comprobar(desc, cond) {
  if (cond) console.log(`  ok   ${desc}`);
  else {
    console.log(`  FALLA ${desc}`);
    fallos++;
  }
}

function aBytes(s) {
  return new TextEncoder().encode(s);
}
async function hmac(secret, mensaje) {
  const k = await crypto.subtle.importKey("raw", aBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, aBytes(mensaje)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Base de datos falsa ---------- */
function dbFalsa() {
  const tablas = { pedidos: [], productos: [], webhooks_vistos: [] };
  const prep = (sql) => {
    const ejecutar = (...args) => aplicar(sql, args);
    return {
      bind: (...args) => ({
        run: async () => ejecutar(...args),
        first: async () => ejecutar(...args)[0] ?? null,
        all: async () => ({ results: ejecutar(...args) }),
      }),
      run: async () => ejecutar(),
      first: async () => ejecutar()[0] ?? null,
      all: async () => ({ results: ejecutar() }),
    };
  };
  function aplicar(sql, args) {
    if (/INSERT INTO pedidos/i.test(sql)) {
      const p = {
        id: args[0], pasarela: args[1], estado: args[2], email: args[3],
        nombre: args[4], telefono: args[5], documento: args[6], total: args[7],
        envio: args[8], items: args[9], created_at: args[10], paid_at: null,
        shipped_at: null, tracking_proveedor: null, tracking_cliente: null,
        envio_direccion: null, notified_owner: 0, notified_buyer: 0, external_id: null,
      };
      tablas.pedidos.push(p);
      return [p];
    }
    if (/UPDATE pedidos SET estado = 'pagado' WHERE id/i.test(sql)) {
      const p = tablas.pedidos.find((x) => x.id === args[0]);
      if (p) p.estado = "pagado";
      return p ? [p] : [];
    }
    if (/WHERE id = \? AND estado = 'pendiente'/i.test(sql)) {
      return [tablas.pedidos.find((x) => x.id === args[0] && x.estado === "pendiente")].filter(Boolean);
    }
    if (/SET external_id = \? WHERE id/i.test(sql)) {
      const p = tablas.pedidos.find((x) => x.id === args[1]);
      if (p) p.external_id = args[0];
      return p ? [p] : [];
    }
    if (/SET envio_direccion/i.test(sql)) {
      const p = tablas.pedidos.find((x) => x.id === args[4]);
      if (p) { p.envio_direccion = args[0]; p.nombre = args[1] ?? p.nombre; }
      return p ? [p] : [];
    }
    if (/SET \$\{campo\} = 1|SET notified_/i.test(sql)) {
      const p = tablas.pedidos.find((x) => x.id === args[0]);
      if (p) p[sql.match(/SET (\w+) = 1/)?.[1]] = 1;
      return p ? [p] : [];
    }
    if (/SET estado = 'enviado'/i.test(sql)) {
      const p = tablas.pedidos.find((x) => x.id === args[2]);
      if (p) { p.estado = "enviado"; p.tracking_cliente = args[2] ? args[2] : p.tracking_cliente; }
      return p ? [p] : [];
    }
    if (/FROM pedidos WHERE/i.test(sql)) {
      const where = /estado = \?/.test(sql) ? tablas.pedidos.filter((p) => p.estado === args[0]) : tablas.pedidos;
      return where;
    }
    if (/FROM productos WHERE activo/i.test(sql)) {
      return tablas.productos.filter((p) => p.activo === 1);
    }
    return [];
  }
  return { tablas, db: { prepare: prep } };
}

const CATALOGO = [
  { id: "p1", nombre: "Lampara", precio: 30000, stock: 5, sku: "L-1", url_origen: "https://x.test/1", activo: 1 },
  { id: "p2", nombre: "Taza", precio: 15000, stock: 2, sku: "T-2", url_origen: "", activo: 1 },
  { id: "p3", nombre: "Agotado", precio: 10000, stock: 0, sku: "A-3", url_origen: "", activo: 1 },
];

const ENV = {
  DB: null,
  ORIGEN: "http://localhost:5173",
  MP_ACCESS_TOKEN: "tok",
  MP_WEBHOOK_SECRET: "secreto-mp",
  FLOW_API_KEY: "fk",
  FLOW_SECRET_KEY: "fs",
  CLAVE_PANEL: "clave-123",
  EMAIL_REMITENTE: "Ascua <hola@ascua.test>",
  EMAIL_NOTIFICACIONES: "hola@ascua.test",
};

function req(url, opciones = {}) {
  return new Request(url, opciones);
}

async function checkoutCon(items, extra = {}) {
  const { tablas, db } = dbFalsa();
  tablas.productos.push(...CATALOGO);
  ENV.DB = db;
  const request = req("https://api.test/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items, email: "cliente@test.cl", nombre: "Cliente Test", ...extra,
    }),
  });
  const res = await worker.fetch(request, ENV, {});
  return { res, json: await res.json(), tablas };
}

/* ================= Firmas ================= */
console.log("\nfirma.js — Mercado Pago");

{
  const ts = Math.floor(Date.now() / 1000);
  const manifiesto = `id:12345;data.id:12345;ts:${ts};`;
  const v1 = await hmac("secreto-mp", manifiesto);
  const request = req("https://api.test/w", {
    headers: {
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": "12345",
    },
  });
  const r = await verificarMercadoPago(request, JSON.stringify({ id: 12345 }), "secreto-mp");
  comprobar("firma valida de id numerico", r.ok === true);
}

{
  const ts = Math.floor(Date.now() / 1000);
  const id = "abc123";
  const v1 = await hmac("secreto-mp", `id:${id};data.id:${id};ts:${ts};`);
  const request = req("https://api.test/w", {
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": id },
  });
  const r = await verificarMercadoPago(request, JSON.stringify({ id }), "secreto-mp");
  comprobar("firma valida de id alfanumerico", r.ok === true);
}

{
  const ts = Math.floor(Date.now() / 1000);
  const request = req("https://api.test/w", {
    headers: { "x-signature": `ts=${ts},v1=abcdef1234567890`, "x-request-id": "12345" },
  });
  const r = await verificarMercadoPago(request, JSON.stringify({ id: 12345 }), "secreto-mp");
  comprobar("rechaza firma incorrecta", r.ok === false);
}

{
  const ts = Math.floor(Date.now() / 1000) - 6000; // 100 minutos old
  const v1 = await hmac("secreto-mp", `id:12345;data.id:12345;ts:${ts};`);
  const request = req("https://api.test/w", {
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "12345" },
  });
  const r = await verificarMercadoPago(request, JSON.stringify({ id: 12345 }), "secreto-mp");
  comprobar("rechaza firma expirada (replay)", r.ok === false);
}

{
  const request = req("https://api.test/w", { headers: {} });
  const r = await verificarMercadoPago(request, "{}", "secreto-mp");
  comprobar("rechaza peticion sin x-signature", r.ok === false);
}

{
  const ts = Math.floor(Date.now() / 1000);
  const request = req("https://api.test/w", {
    headers: { "x-signature": `ts=${ts},v1=abcdef1234567890`, "x-request-id": "1" },
  });
  const r = await verificarMercadoPago(request, "{}", "");
  comprobar("rechaza si no hay secreto configurado", r.ok === false);
}

console.log("\nfirma.js — Flow");

{
  const ts = Math.floor(Date.now() / 1000);
  const cuerpo = JSON.stringify({ status: "paid", flowOrder: "abc" });
  const v1 = await hmac("fs", `${ts}${cuerpo}`);
  const request = req("https://api.test/w", {
    headers: { "x-flow-signature": v1, "x-flow-signature-timestamp": String(ts) },
  });
  const r = await verificarFlow(request, cuerpo, "fs");
  comprobar("firma Flow valida", r.ok === true);
}

{
  const ts = Math.floor(Date.now() / 1000);
  const cuerpo = JSON.stringify({ status: "paid" });
  const request = req("https://api.test/w", {
    headers: { "x-flow-signature": "malo", "x-flow-signature-timestamp": String(ts) },
  });
  const r = await verificarFlow(request, cuerpo, "fs");
  comprobar("rechaza firma Flow incorrecta", r.ok === false);
}

{
  const ts = Math.floor(Date.now() / 1000);
  const cuerpoUno = JSON.stringify({ status: "paid" });
  const v1 = await hmac("fs", `${ts}${cuerpoUno}`);
  const request = req("https://api.test/w", {
    headers: { "x-flow-signature": v1, "x-flow-signature-timestamp": String(ts) },
  });
  const cuerpoDos = JSON.stringify({ status: "paid",Hack: "modificado" });
  const r = await verificarFlow(request, cuerpoDos, "fs");
  comprobar("rechaza si el cuerpo cambio tras firmar", r.ok === false);
}

/* ================= Checkout ================= */
console.log("\nindex.js — checkout");

{
  const { res, json } = await checkoutCon([{ id: "p1", cantidad: 2 }]);
  comprobar("acepta pedido valido", res.status !== 400);
  comprobar("total = 2 x 30000", json.total === 60000);
  comprobar("no aplica envio sobre 30000", json.total >= 30000);
}

{
  const { json } = await checkoutCon([{ id: "p2", cantidad: 1 }]);
  comprobar("agrega envio bajo el minimo (15000)", json.total === 15000 + 3990);
  comprobar("informa el envio por separado", json.envio === 3990);
  comprobar("subtotal sin envio", json.subtotal === 15000);
}

{
  const { json } = await checkoutCon([{ id: "p1", cantidad: 1, precio: 1 }]);
  comprobar("ignora precio enviado por el cliente", json.total === 30000);
}

{
  const { res, json } = await checkoutCon([{ id: "inexistente", cantidad: 1 }]);
  comprobar("rechaza producto inexistente", res.status === 400);
  comprobar("detalla el problema", Array.isArray(json.detalles) && json.detalles.length > 0);
}

{
  const { res } = await checkoutCon([{ id: "p3", cantidad: 1 }]);
  comprobar("rechaza producto sin stock", res.status === 400);
}

{
  const { res } = await checkoutCon([{ id: "p2", cantidad: 99 }]);
  comprobar("rechaza exceso de stock", res.status === 400);
}

{
  const { res } = await checkoutCon([{ id: "p1", cantidad: 0 }]);
  comprobar("rechaza cantidad 0", res.status === 400);
}

{
  const { res } = await checkoutCon([{ id: "p1", cantidad: -3 }]);
  comprobar("rechaza cantidad negativa", res.status === 400);
}

{
  const { res } = await checkoutCon([{ id: "p1", cantidad: 2.5 }]);
  comprobar("rechaza cantidad decimal", res.status === 400);
}

{
  const { res } = await checkoutCon([], { email: "a@b.cl" });
  comprobar("rechaza carrito vacio", res.status === 400);
}

{
  const { res } = await checkoutCon([{ id: "p1", cantidad: 1 }], { email: "no-es-email" });
  comprobar("rechaza email invalido", res.status === 400);
}

{
  const muchos = Array.from({ length: 31 }, () => ({ id: "p1", cantidad: 1 }));
  const { res } = await checkoutCon(muchos);
  comprobar("rechaza mas de 30 lineas", res.status === 400);
}

{
  const { res } = await checkoutCon([{ id: "p1", cantidad: 999 }]);
  comprobar("limita unidades por linea (20)", res.status === 400);
}

console.log("\nindex.js — panel protegido");

{
  const { db } = dbFalsa();
  ENV.DB = db;
  const sinClave = await worker.fetch(req("https://api.test/api/pedidos"), ENV, {});
  comprobar("rechaza sin Authorization", sinClave.status === 401);

  const claveMala = await worker.fetch(
    req("https://api.test/api/pedidos", { headers: { authorization: "Bearer incorrecta" } }),
    ENV, {}
  );
  comprobar("rechaza clave incorrecta", claveMala.status === 401);

  const ok = await worker.fetch(
    req("https://api.test/api/pedidos", { headers: { authorization: "Bearer clave-123" } }),
    ENV, {}
  );
  comprobar("acepta clave correcta", ok.status === 200);
}

console.log("\nindex.js — salud");

{
  const env = { ...ENV, DB: null, MP_ACCESS_TOKEN: undefined };
  const res = await worker.fetch(req("https://api.test/api/salud"), env, {});
  const r = await res.json();
  comprobar("reporta faltantes", r.ok === false && r.faltantes.includes("MP_ACCESS_TOKEN"));
  comprobar("reporta moneda CLP", r.moneda === "CLP");
}

console.log("\nindex.js — rutas y CORS");

{
  const { db } = dbFalsa();
  ENV.DB = db;
  const noEncontrada = await worker.fetch(req("https://api.test/api/nada"), ENV, {});
  comprobar("404 en ruta desconocida", noEncontrada.status === 404);

  const options = await worker.fetch(req("https://api.test/api/checkout", { method: "OPTIONS" }), ENV, {});
  comprobar("responde a OPTIONS (CORS)", options.status === 204);
}

console.log("\npedidos.js — idempotencia");

{
  const { db } = dbFalsa();
  await modPedidos.crearPedido(db, {
    id: "asc_test", pasarela: "mercadopago", estado: "pendiente",
    email: "c@test.cl", nombre: "C", total: 100, envio: 0, items: [],
  });
  const t = await modPedidos.tomarPedido(db, "asc_test");
  comprobar("toma el pedido pendiente", t !== null);

  const otra = await modPedidos.tomarPedido(db, "asc_test");
  comprobar("segunda llamada no lo vuelve a tomar (idempotente)", otra === null);
}

console.log("\nwebhooks rechazan firma mala");

{
  const { db } = dbFalsa();
  ENV.DB = db;
  const res = await worker.fetch(
    req("https://api.test/api/webhook/mercadopago", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: 1 } }),
    }),
    ENV, {}
  );
  comprobar("MP responde 401 sin firma", res.status === 401);

  const resFlow = await worker.fetch(
    req("https://api.test/api/webhook/flow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "paid", flowOrder: "x", commerceOrder: "y" }),
    }),
    ENV, {}
  );
  comprobar("Flow responde 401 sin firma", resFlow.status === 401);
}

console.log("\nwebhook MP con firma valida marca el pedido pagado");

{
  const { db, tablas } = dbFalsa();
  tablas.productos.push(...CATALOGO);
  ENV.DB = db;
  await modPedidos.crearPedido(db, {
    id: "asc_pagado", pasarela: "mercadopago", estado: "pendiente",
    email: "cliente@test.cl", nombre: "Cliente Test", total: 33990, envio: 0,
    items: [{ id: "p1", nombre: "Lampara", cantidad: 1, precioUnitario: 30000, sku: "L-1", urlOrigen: "" }],
  });

  const ts = Math.floor(Date.now() / 1000);
  const cuerpo = JSON.stringify({ type: "payment", data: { id: 555 } });
  // id numerico: MP espera las dos claves, "id" y "data.id".
  const v1 = await hmac(ENV.MP_WEBHOOK_SECRET, `id:555;data.id:555;ts:${ts};`);

  const res = await worker.fetch(
    req("https://api.test/api/webhook/mercadopago", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature": `ts=${ts},v1=${v1}`,
        "x-request-id": "555",
      },
      body: cuerpo,
    }),
    ENV, {}
  );
  comprobar("webhook aceptado", res.status === 200);

  const pedido = tablas.pedidos.find((p) => p.id === "asc_pagado");
  comprobar("pedido queda pagado", pedido.estado === "pagado");
  comprobar("guarda el id del pago", pedido.external_id === "555");
  comprobar("guarda direccion de envio", !!pedido.envio_direccion);
}

console.log(fallos === 0 ? "\nTodas las pruebas pasaron.\n" : `\n${fallos} prueba(s) fallaron.\n`);
process.exit(fallos === 0 ? 0 : 1);
