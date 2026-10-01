/**
 * Pedidos en D1. El total se guarda ya resuelto en CLP: si manana cambias un
 * precio, el historico de lo que cobro no se mueve.
 */

export function nuevoId() {
  return `asc_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function crearPedido(db, pedido) {
  await db
    .prepare(
      `INSERT INTO pedidos
        (id, pasarela, estado, email, nombre, telefono, documento, total, envio,
         items, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      pedido.id,
      pedido.pasarela,
      pedido.estado,
      pedido.email,
      pedido.nombre,
      pedido.telefono ?? null,
      pedido.documento ?? null,
      pedido.total,
      pedido.envio,
      JSON.stringify(pedido.items),
      new Date().toISOString()
    )
    .run();
  return pedido;
}

export async function marcarPagado(db, pasarela, externalId, pedidoId) {
  await db
    .prepare(`UPDATE pedidos SET external_id = ? WHERE id = ? AND pasarela = ?`)
    .bind(externalId ?? null, pedidoId, pasarela)
    .run();
}

export async function guardarShipping(db, pedidoId, shipping) {
  await db
    .prepare(
      `UPDATE pedidos SET envio_direccion = ?, nombre = COALESCE(?, nombre),
                         telefono = COALESCE(?, telefono),
                         documento = COALESCE(?, documento)
        WHERE id = ?`
    )
    .bind(
      JSON.stringify(shipping ?? {}),
      shipping?.nombre ?? null,
      shipping?.telefono ?? null,
      shipping?.documento ?? null,
      pedidoId
    )
    .run();
}

/**
 * Busca el pedido por su id interno, que es lo que viaja como
 * external_reference en Mercado Pago y commerceOrder en Flow.
 *
 * Busca por `id` y no por `external_id`: external_id es el identificador de la
 * pasarela y no existe hasta que la pasarela notifica el pago, asi que buscar
 * por ahi nunca encontraria nada.
 */
export async function tomarPedido(db, pedidoId) {
  const fila = await db
    .prepare(`SELECT * FROM pedidos WHERE id = ? AND estado = 'pendiente'`)
    .bind(pedidoId)
    .first();

  if (!fila) return null;

  await db
    .prepare(`UPDATE pedidos SET estado = 'pagado' WHERE id = ?`)
    .bind(fila.id)
    .run();

  return { ...fila, items: JSON.parse(fila.items) };
}

export async function marcarAvisoEnviado(db, id, campo) {
  if (campo !== "notified_owner" && campo !== "notified_buyer") return;
  await db
    .prepare(`UPDATE pedidos SET ${campo} = 1 WHERE id = ?`)
    .bind(id)
    .run();
}

export async function listarPedidos(db, { estado, limite = 50 } = {}) {
  const condiciones = [];
  const args = [];

  if (estado) {
    condiciones.push("estado = ?");
    args.push(estado);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  args.push(Math.min(Number(limite) || 50, 200));

  const { results } = await db
    .prepare(`SELECT * FROM pedidos ${where} ORDER BY created_at DESC LIMIT ?`)
    .bind(...args)
    .all();
  return results;
}

export async function marcarEnviado(db, id, tracking) {
  await db
    .prepare(
      `UPDATE pedidos SET estado = 'enviado', shipped_at = ?,
                         tracking_proveedor = ?, tracking_cliente = ?
        WHERE id = ?`
    )
    .bind(new Date().toISOString(), tracking.proveedor ?? null, tracking.cliente ?? null, id)
    .run();
}

export async function cargarProductos(db) {
  const { results } = await db
    .prepare(`SELECT * FROM productos WHERE activo = 1`)
    .all();
  return results ?? [];
}
