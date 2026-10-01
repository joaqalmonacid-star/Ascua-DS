/**
 * Mercado Pago via Checkout Pro (preferencias). Sandbox:
 * https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/preferences
 */

const BASE = "https://api.mercadopago.com";

async function llamar(ruta, token, opciones = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...opciones.headers,
    },
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = datos.message || JSON.stringify(datos);
    throw new Error(`Mercado Pago ${ruta} -> HTTP ${res.status}: ${detalle}`);
  }
  return datos;
}

export async function consultarPago(idPago, token) {
  try {
    return await llamar(`/v3/payments/${encodeURIComponent(idPago)}`, token);
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Las notificaciones de Mercado Pago traen shipping casi siempre vacio, asi
 * que se separa de /v3/payments/{id}, que si lo trae.
 */
export async function obtenerShipping(idPago, token) {
  try {
    const p = await llamar(`/v3/payments/${encodeURIComponent(idPago)}`, token);
    const s = p.shipping ?? {};
    return {
      nombre: s.receiver_name ?? null,
      telefono: s.phone?.number ?? null,
      documento: s.documentation?.number ?? null,
      direccion: {
        calle: s.street_name ?? "",
        numero: s.street_number ?? "",
        piso: s.floor ?? "",
        depto: s.apartment ?? "",
        comuna: s.city_name ?? "",
        region: s.state_name ?? "",
        pais: s.country?.name ?? "",
        codigoPostal: s.zip_code ?? "",
      },
    };
  } catch (e) {
    return null;
  }
}

export async function crearPreferencia({ token, pedido, origen }) {
  const externos = pedido.items.map((i) => ({
    title: i.nombre.slice(0, 250),
    quantity: i.cantidad,
    unit_price: i.precioUnitario,
    currency_id: "CLP",
    description: i.nombre.slice(0, 250),
  }));

  const cuerpo = {
    items: externos,
    payer: {
      email: pedido.email,
      name: (pedido.nombre || "Cliente").split(" ").slice(0, 2).join(" "),
    },
    shipments: {
      mode: "not_specified",
      cost: pedido.envio,
      free_methods: [{ id: 1 }] .filter(() => pedido.envio === 0),
    },
    external_reference: pedido.id,
    notification_url: `${origen}/api/webhook/mercadopago`,
    back_urls: {
      success: `${origen}/gracias.html?pedido=${pedido.id}`,
      pending: `${origen}/gracias.html?pedido=${pedido.id}&estado=pendiente`,
      failure: `${origen}/checkout.html?error=pago-rechazado`,
    },
    auto_return: "approved",
    statement_descriptor: "ASCUA",
    metadata: {
      pedido_id: pedido.id,
      proveedor: pedido.proveedor ?? "local",
    },
  };

  // En sandbox la preferencia trae sandbox_init_point en vez de init_point;
  // el mismo POST sirve para ambos, asi que no hay nada que cambiar aqui.
  return llamar("/checkout/preferences", token, {
    method: "POST",
    body: JSON.stringify(cuerpo),
  });
}

/** Consulta una preferencia ya creada, util para recuperar la init_point. */
export async function consultarPreferencia(idPreferencia, token) {
  try {
    return await llamar(
      `/checkout/preferences/${encodeURIComponent(idPreferencia)}`,
      token
    );
  } catch (e) {
    return { error: e.message };
  }
}
