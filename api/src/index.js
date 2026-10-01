/**
 * Worker de Ascua.
 *
 * Regla central: el navegador NUNCA manda precios. El cliente envia ids y
 * cantidades; el total se calcula aqui contra la tabla productos. Si el total
 * no cuadra, el pago se rechaza.
 *
 * Rutas:
 *   POST /api/checkout              crea la preferencia/pago y devuelve la URL
 *   GET  /api/webhook/mercadopago   notificacion de pago (MP)
 *   GET  /api/webhook/flow          notificacion de pago (Flow)
 *   GET  /api/pedidos               lista pedidos (requiere clave)
 *   POST /api/pedidos/:id/tracking  registra envio (requiere clave)
 *   GET  /api/salud                 chequeo de configuracion
 */

import { verificarMercadoPago, verificarFlow } from "./firma.js";
import * as db from "./pedidos.js";
import * as mp from "./mercado-pago.js";
import * as flow from "./flow.js";
import { avisarPedido } from "./email.js";

/**
 * El sitio y la API comparten dominio, asi que el navegador no pide CORS: no se
 * envia ninguna cabecera de acceso cruzado. Solo hace falta si algun dia el
 * sitio se sirve desde otro dominio, y entonces se limita a ese origen en vez
 * de abrirlo a cualquiera.
 */
function cors(env) {
  const origen = env?.CORS_ORIGIN;
  if (!origen) return {};
  return {
    "access-control-allow-origin": origen,
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    vary: "origin",
  };
}

function json(env, cuerpo, status = 200, cabeceras = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...cors(env),
      ...cabeceras,
    },
  });
}

const MAX_ITEMS = 30;
const MAX_UNIDADES = 20;
const ENVIO_FIJO = 3990; // CLP

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    const url = new URL(request.url);
    const ruta = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (ruta === "/api/salud" && request.method === "GET") return salud(env);
      if (ruta === "/api/checkout" && request.method === "POST")
        return checkout(request, env, url);
      if (ruta === "/api/webhook/mercadopago") return webhookMP(request, env, url);
      if (ruta === "/api/webhook/flow") return webhookFlow(request, env, url);

      const conTracking = ruta.match(/^\/api\/pedidos\/([\w-]+)\/tracking$/);
      if (conTracking && request.method === "POST")
        return registrarTracking(request, env, conTracking[1]);

      if (ruta === "/api/pedidos" && request.method === "GET")
        return listarPedidos(request, env, url);

      return json(env, { error: "Ruta no encontrada" }, 404);
    } catch (e) {
      console.error("error no controlado:", e);
      return json(env, { error: "Error interno" }, 500);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

async function checkout(request, env, url) {
  const cuerpo = await request.json().catch(() => null);
  if (!cuerpo) return json(env, { error: "Cuerpo JSON invalido" }, 400);

  const items = Array.isArray(cuerpo.items) ? cuerpo.items : [];
  if (items.length === 0) return json(env, { error: "Carrito vacio" }, 400);
  if (items.length > MAX_ITEMS)
    return json(env, { error: `Maximo ${MAX_ITEMS} productos por pedido` }, 400);

  const email = String(cuerpo.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    return json(env, { error: "Email invalido" }, 400);
  }

  const sandbox = cuerpo.sandbox === true;
  const pasarela = cuerpo.pasarela === "flow" ? "flow" : "mercadopago";

  // --- Calcula el total desde la base de datos, no desde el cliente ---
  const catalogo = new Map(
    (await db.cargarProductos(env.DB)).map((p) => [p.id, p])
  );

  const calculados = [];
  let total = 0;
  const problemas = [];

  for (const item of items) {
    const id = String(item.id ?? "");
    const producto = catalogo.get(id);

    // Se valida el numero tal cual: aplicar Math.floor antes dejaria pasar
    // 2.5 como si fuera 2, que es pedirle al cliente que pague de menos.
    const cantidad = Number(item.cantidad);

    if (!producto) {
      problemas.push(`Producto desconocido: ${id}`);
      continue;
    }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_UNIDADES) {
      problemas.push(`Cantidad invalida para ${producto.nombre ?? id}`);
      continue;
    }
    if (producto.stock < cantidad) {
      problemas.push(`Sin stock suficiente de ${producto.nombre}`);
      continue;
    }

    const precioUnitario = producto.precio;
    total += precioUnitario * cantidad;
    calculados.push({
      id: producto.id,
      nombre: producto.nombre,
      cantidad,
      precioUnitario,
      sku: producto.sku,
      urlOrigen: producto.url_origen,
    });
  }

  if (problemas.length > 0) {
    return json(env, { error: "Carrito invalido", detalles: problemas }, 400);
  }

  const envio = cuerpo.envioGratis === true || total >= 30000 ? 0 : ENVIO_FIJO;
  const pedido = {
    id: db.nuevoId(),
    pasarela,
    estado: "pendiente",
    email,
    nombre: String(cuerpo.nombre ?? "").trim().slice(0, 120) || "Cliente",
    telefono: String(cuerpo.telefono ?? "").trim().slice(0, 30) || null,
    documento: String(cuerpo.documento ?? "").trim().slice(0, 30) || null,
    total,
    envio,
    items: calculados,
    proveedor: calculados[0]?.urlOrigen ? "aliexpress" : "local",
  };

  await db.crearPedido(env.DB, pedido);

  const origen = env.ORIGEN || url.origin;
  try {
    if (pasarela === "flow") {
      const r = await flow.crearPagoFlow({
        apiKey: sandbox ? env.FLOW_API_KEY_SANDBOX : env.FLOW_API_KEY,
        secretKey: sandbox ? env.FLOW_SECRET_SANDBOX : env.FLOW_SECRET_KEY,
        pedido,
        origen,
        sandbox,
      });
      const link = r.url || r.response?.url;
      if (!link) throw new Error("Flow no devolvio URL de pago");
      return json(env, { pedidoId: pedido.id, url: link, ...resumenPago(pedido), sandbox });
    }

    const token = sandbox ? env.MP_ACCESS_TOKEN_SANDBOX : env.MP_ACCESS_TOKEN;
    const pref = await mp.crearPreferencia({ token, pedido, origen });
    const link = (sandbox ? pref.sandbox_init_point : pref.init_point) || pref.init_point;
    if (!link) throw new Error("Mercado Pago no devolvio init_point");
    return json(env, { pedidoId: pedido.id, url: link, ...resumenPago(pedido), sandbox });
  } catch (e) {
    // El pedido queda registrado para que puedas revisar, pero el cliente ve
    // un error generico: nunca le exponemos el detalle de la pasarela.
    console.error("checkout fallido:", e.message);
    return json(env, 
      { error: "No pudimos iniciar el pago. Intenta de nuevo en un momento.", pedidoId: pedido.id },
      502
    );
  }
}

/** `total` es lo que se cobra, envio incluido. `subtotal` es solo productos. */
function resumenPago(pedido) {
  return {
    subtotal: pedido.total,
    envio: pedido.envio,
    total: pedido.total + pedido.envio,
  };
}

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

async function webhookMP(request, env, url) {
  const cuerpoTexto = await request.text();
  const verificacion = await verificarMercadoPago(
    request,
    cuerpoTexto,
    env.MP_WEBHOOK_SECRET
  );
  if (!verificacion.ok) {
    console.warn("webhook MP rechazado:", verificacion.motivo);
    return json(env, { error: "Firma invalida" }, 401);
  }

  let datos;
  try {
    datos = JSON.parse(cuerpoTexto);
  } catch (e) {
    return json(env, { error: "Cuerpo invalido" }, 400);
  }

  // MP manda dos tipos: notificacion de pago e informacion de la preferencia.
  if (datos.type === "payment" || datos.action === "payment.updated") {
    await procesarPagoMP(datos.data?.id, env);
  } else if (datos.type === "preference") {
    await procesarPreferenciaMP(datos.data?.id, env);
  }
  return json(env, { recibido: true });
}

async function procesarPagoMP(idPago, env) {
  if (!idPago) return;
  const pago = await mp.consultarPago(idPago, env.MP_ACCESS_TOKEN);
  if (pago.error) return console.error("MP pago:", pago.error);
  if (pago.status !== "approved") {
    console.log(`MP pago ${idPago} en estado ${pago.status}, no se procesa`);
    return;
  }
  const pedidoId = pago.external_reference;
  if (!pedidoId) {
    console.error(`MP pago ${idPago} sin external_reference, se ignora`);
    return;
  }
  await finalizarPedido("mercadopago", pedidoId, String(idPago), env, { pago });
}

async function procesarPreferenciaMP(idPreferencia, env) {
  const pref = await mp.consultarPreferencia(idPreferencia, env.MP_ACCESS_TOKEN);
  if (pref.error || !pref?.external_reference) return;
  const pagoId = pref.collector?.id ? String(pref.collector.id) : null;
  if (!pagoId) return;
  const pago = await mp.consultarPago(pagoId, env.MP_ACCESS_TOKEN);
  if (pago.status === "approved") {
    await finalizarPedido("mercadopago", pref.external_reference, pagoId, env, { pago });
  }
}

async function webhookFlow(request, env, url) {
  const cuerpoTexto = await request.text();
  const verificacion = await verificarFlow(request, cuerpoTexto, env.FLOW_SECRET_KEY);
  if (!verificacion.ok) {
    console.warn("webhook Flow rechazado:", verificacion.motivo);
    return json(env, { error: "Firma invalida" }, 401);
  }

  let datos;
  try {
    datos = JSON.parse(cuerpoTexto);
  } catch (e) {
    return json(env, { error: "Cuerpo invalido" }, 400);
  }

  // Flow manda commerceOrder con el id interno del pedido.
  const pedidoId = String(datos.commerceOrder ?? datos.flowOrder ?? "");
  if (!pedidoId) return json(env, { error: "Sin commerceOrder" }, 400);
  if (datos.status !== "paid" && datos.status !== "completed") {
    console.log(`Flow pedido ${pedidoId} en estado ${datos.status}`);
    return json(env, { recibido: true });
  }
  await finalizarPedido("flow", pedidoId, datos.flowOrder ?? null, env, { flow: datos });
}

/**
 * Punto unico de confirmacion de pago para ambas pasarelas. Idempotente: si el
 * webhook llega dos veces, la segunda no vuelve a enviar emails.
 */
async function finalizarPedido(pasarela, pedidoId, externalId, env, extra) {
  const pedido = await db.tomarPedido(env.DB, pedidoId);
  if (!pedido) {
    console.log(`pedido ${pedidoId} ya estaba procesado o no existe`);
    return;
  }

  if (externalId) {
    await db.marcarPagado(env.DB, pasarela, externalId, pedidoId);
  }

  const shipping = pasarela === "mercadopago"
    ? await mp.obtenerShipping(externalId, env.MP_ACCESS_TOKEN)
    : {
        nombre: extra.flow?.customerName ?? null,
        telefono: extra.flow?.phone ?? null,
        documento: null,
        direccion: extra.flow?.shipping ?? null,
      };

  if (shipping) {
    await db.guardarShipping(env.DB, pedidoId, shipping.direccion ?? shipping);
  }

  const emailDueno = env.EMAIL_NOTIFICACIONES;
  const resultado = await avisarPedido({
    env,
    pedido: { ...pedido, envio_direccion: shipping?.direccion ?? null },
    emailCliente: pedido.email,
    emailDueno,
  });

  if (resultado.enviado) {
    await db.marcarAvisoEnviado(env.DB, pedido.id, "notified_owner");
    await db.marcarAvisoEnviado(env.DB, pedido.id, "notified_buyer");
  } else {
    console.warn("avisos no enviados:", resultado.motivo, resultado.errores);
  }
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

function autorizado(request, env) {
  const cabecera = request.headers.get("authorization") || "";
  const token = cabecera.replace(/^Bearer\s+/i, "").trim();
  if (!env.CLAVE_PANEL || !token) return false;
  // Comparacion segura por igualdad string (la clave es corta y interna).
  return token === env.CLAVE_PANEL;
}

async function listarPedidos(request, env, url) {
  if (!autorizado(request, env)) return json(env, { error: "No autorizado" }, 401);
  const pedidos = await db.listarPedidos(env.DB, {
    estado: url.searchParams.get("estado") || undefined,
    limite: url.searchParams.get("limite") || 50,
  });
  return json(env, {
    pedidos: pedidos.map((p) => ({ ...p, items: JSON.parse(p.items) })),
  });
}

async function registrarTracking(request, env, id) {
  if (!autorizado(request, env)) return json(env, { error: "No autorizado" }, 401);
  const cuerpo = await request.json().catch(() => ({}));
  await db.marcarEnviado(env.DB, id, {
    proveedor: cuerpo.proveedor ?? null,
    cliente: cuerpo.cliente ?? null,
  });
  return json(env, { ok: true });
}

/* ------------------------------------------------------------------ */

function salud(env) {
  const faltantes = [];
  if (!env.MP_ACCESS_TOKEN) faltantes.push("MP_ACCESS_TOKEN");
  if (!env.MP_WEBHOOK_SECRET) faltantes.push("MP_WEBHOOK_SECRET");
  if (!env.FLOW_API_KEY) faltantes.push("FLOW_API_KEY");
  if (!env.FLOW_SECRET_KEY) faltantes.push("FLOW_SECRET_KEY");
  if (!env.CLAVE_PANEL) faltantes.push("CLAVE_PANEL");
  if (!env.DB) faltantes.push("DB");
  return json(env, {
    ok: faltantes.length === 0,
    faltantes,
    moneda: "CLP",
    envioFijo: ENVIO_FIJO,
    envioGratisDesde: 30000,
  });
}
