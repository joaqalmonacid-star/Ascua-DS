/**
 * Panel de pedidos. Sirve para dos cosas: confirmar que llego el dinero y
 * tener la informacion de envio lista para comprar al proveedor y pegar el
 * tracking. La clave viaja en el encabezado Authorization, nunca en la URL.
 */
(function () {
  "use strict";

  const { escapar, precio } = window.UI;
  const apiUrl = window.CONFIG.checkout.apiUrl;
  const CLAVE = "ascua:clave-panel";

  // apiUrl vacio = mismo origen, el caso normal en produccion.
  const api = (ruta) => `${apiUrl.replace(/\/+$/, "")}${ruta}`;

  const nodos = {
    clave: document.getElementById("clave"),
    filtro: document.getElementById("filtro-estado"),
    boton: document.getElementById("btn-cargar"),
    lista: document.getElementById("lista-pedidos"),
    aviso: document.getElementById("aviso-panel"),
  };

  function clave() {
    const guardada = localStorage.getItem(CLAVE) || "";
    if (nodos.clave.value) {
      localStorage.setItem(CLAVE, nodos.clave.value);
      return nodos.clave.value;
    }
    return guardada;
  }

  function avisar(mensaje, esError = false) {
    nodos.aviso.hidden = !mensaje;
    nodos.aviso.textContent = mensaje || "";
    nodos.aviso.classList.toggle("aviso--error", esError && !!mensaje);
  }

  function direccion(d) {
    if (!d) return "<em>No registrada</em>";
    return [d.calle, d.numero, d.piso ? `piso ${d.piso}` : "", d.depto ? `depto ${d.depto}` : "", d.comuna, d.region, d.codigoPostal]
      .filter(Boolean)
      .join(", ");
  }

  function tarjeta(p) {
    const filas = p.items
      .map(
        (i) => `<li>
          <span>${escapar(i.nombre)}</span>
          <span class="pedido__cant">x${i.cantidad}</span>
          <span>${precio(i.precioUnitario * i.cantidad)}</span>
          ${
            i.sku
              ? `<code>${escapar(i.sku)}</code>`
              : ""
          }
          ${
            i.urlOrigen
              ? `<a href="${escapar(i.urlOrigen)}" target="_blank" rel="noopener noreferrer">comprar</a>`
              : '<span class="pedido__nota">sin link de proveedor</span>'
          }
        </li>`
      )
      .join("");

    return `<article class="pedido">
      <header class="pedido__cabecera">
        <div>
          <h2>${escapar(p.id)}</h2>
          <p class="pedido__meta">
            ${escapar(p.pasarela)} · ${new Date(p.created_at).toLocaleString("es-CL")}
          </p>
        </div>
        <span class="estado estado--${escapar(p.estado)}">${escapar(p.estado)}</span>
      </header>

      <div class="pedido__cuerpo">
        <div>
          <p><strong>Cliente:</strong> ${escapar(p.nombre)}</p>
          <p><strong>Email:</strong> ${escapar(p.email)}</p>
          ${p.telefono ? `<p><strong>Tel:</strong> ${escapar(p.telefono)}</p>` : ""}
          <p><strong>Direccion:</strong> ${direccion(p.envio_direccion)}</p>
        </div>
        <div class="pedido__total">
          <p>Total: <strong>${precio(p.total + p.envio)}</strong></p>
          <p>Enviado a cliente: ${p.notified_buyer ? "si" : "no"}</p>
        </div>
      </div>

      <ul class="pedido__items">${filas}</ul>

      ${
        p.estado !== "enviado"
          ? `<form class="pedido__tracking" data-pedido="${escapar(p.id)}">
              <input type="text" name="proveedor" placeholder="Tracking proveedor" />
              <input type="text" name="cliente" placeholder="Tracking para el cliente" />
              <button class="boton" type="submit">Marcar enviado</button>
            </form>`
          : `<p class="pedido__nota">Enviado. Tracking cliente: ${escapar(p.tracking_cliente || "-")}</p>`
      }
    </article>`;
  }

  async function cargar() {
    const k = clave();
    if (!k) {
      avisar("Escribe la clave del panel.", true);
      return;
    }

    nodos.boton.disabled = true;
    avisar("");
    try {
      const params = new URLSearchParams();
      if (nodos.filtro.value) params.set("estado", nodos.filtro.value);

      const res = await fetch(`${api("/api/pedidos")}?${params}`, {
        headers: { authorization: `Bearer ${k}` },
      });
      const r = await res.json();

      if (res.status === 401) {
        localStorage.removeItem(CLAVE);
        avisar("Clave incorrecta.", true);
        nodos.lista.innerHTML = "";
        return;
      }
      if (!res.ok) {
        avisar(r.error || "No se pudieron cargar los pedidos.", true);
        return;
      }

      nodos.lista.innerHTML = r.pedidos.length
        ? r.pedidos.map(tarjeta).join("")
        : '<p class="aviso">No hay pedidos con ese filtro.</p>';
    } catch (e) {
      avisar("No pudimos conectarnos con el servidor.", true);
    } finally {
      nodos.boton.disabled = false;
    }
  }

  async function registrarTracking(form) {
    const datos = new FormData(form);
    const k = clave();
    try {
      const res = await fetch(
        api(`/api/pedidos/${form.dataset.pedido}/tracking`),
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${k}` },
          body: JSON.stringify({
            proveedor: String(datos.get("proveedor") || ""),
            cliente: String(datos.get("cliente") || ""),
          }),
        }
      );
      if (!res.ok) {
        avisar("No se pudo guardar el tracking.", true);
        return;
      }
      avisar("Tracking guardado.");
      cargar();
    } catch (e) {
      avisar("No pudimos conectarnos con el servidor.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    nodos.clave.value = localStorage.getItem(CLAVE) || "";
    nodos.boton.addEventListener("click", cargar);
    nodos.filtro.addEventListener("change", cargar);
    nodos.clave.addEventListener("keydown", (e) => {
      if (e.key === "Enter") cargar();
    });
    nodos.lista.addEventListener("submit", (e) => {
      e.preventDefault();
      registrarTracking(e.target);
    });
    if (nodos.clave.value) cargar();
  });
})();
