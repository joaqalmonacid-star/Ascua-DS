/**
 * Avisos por email. Resend es simple y tiene plan gratuito. Si falla el envio,
 * el pedido sigue registrado: nunca se pierde una venta por un correo.
 */

function html(pedido, esCliente) {
  const filas = pedido.items
    .map(
      (i) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapar(i.nombre)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i.cantidad}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formato(i.precioUnitario)}</td>
      </tr>`
    )
    .join("");

  const entrega = esCliente
    ? `<p>Tu pedido está siendo preparado. Te avisaremos el número de seguimiento
       cuando salga del proveedor.</p>`
    : `<h2>Nuevo pedido pagado</h2>
       <p>Compra en el proveedor y pega el tracking en el panel.</p>`;

  return `<!DOCTYPE html><html lang="es"><body style="font-family:sans-serif;color:#222">
    <h1 style="font-size:20px">Ascua</h1>
    ${entrega}
    <p><strong>Pedido:</strong> ${pedido.id}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead><tr>
        <th align="left" style="padding:8px;background:#f6f6f6">Producto</th>
        <th style="padding:8px;background:#f6f6f6">Cant.</th>
        <th align="right" style="padding:8px;background:#f6f6f6">Precio</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p><strong>Envío:</strong> ${formato(pedido.envio)}</p>
    <p style="font-size:18px"><strong>Total: ${formato(pedido.total)}</strong></p>
    ${
      esCliente && pedido.envio_direccion
        ? `<h3 style="font-size:15px">Direccion de entrega</h3>
           <p>${direccionTexto(pedido.envio_direccion)}</p>`
        : ""
    }
  </body></html>`;
}

function escapar(t) {
  return String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function formato(n) {
  return "$" + Number(n || 0).toLocaleString("es-CL");
}

function direccionTexto(d) {
  return [
    d.calle,
    d.numero,
    d.piso ? `piso ${d.piso}` : "",
    d.depto ? `depto ${d.depto}` : "",
    d.comuna,
    d.region,
    d.codigoPostal,
    d.pais,
  ]
    .filter(Boolean)
    .join(", ");
}

async function enviar({ apiKey, hacia, asunto, contenido, remitente }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: remitente, to: [hacia], subject: asunto, html: contenido }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend HTTP ${res.status}: ${err.slice(0, 200)}`);
  }
}

export async function avisarPedido({ env, pedido, emailCliente, emailDueno }) {
  const errores = [];
  if (!env.RESEND_API_KEY) {
    return { enviado: false, motivo: "RESEND_API_KEY no configurado", errores };
  }
  const remitente = env.EMAIL_REMITENTE || "Ascua <hola@ascua.test>";

  if (emailDueno) {
    try {
      await enviar({
        apiKey: env.RESEND_API_KEY,
        hacia: emailDueno,
        asunto: `Pedido pagado ${pedido.id}`,
        contenido: html(pedido, false),
        remitente,
      });
    } catch (e) {
      errores.push(`dueno: ${e.message}`);
    }
  }

  if (emailCliente) {
    try {
      await enviar({
        apiKey: env.RESEND_API_KEY,
        hacia: emailCliente,
        asunto: `Confirmacion de pedido ${pedido.id}`,
        contenido: html(pedido, true),
        remitente,
      });
    } catch (e) {
      errores.push(`cliente: ${e.message}`);
    }
  }

  return { enviado: errores.length === 0, errores };
}

export { html, direccionTexto };
