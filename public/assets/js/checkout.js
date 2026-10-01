/**
 * Checkout: Arma el pedido y lo envia al Worker. El navegador NO calcula el
 * total final: solo muestra un estimado. El Worker recalcula contra la base
 * de datos y es su numero el que se cobra.
 */
(function () {
  "use strict";

  const { escapar, precio } = window.UI;
  const cfg = window.CONFIG.checkout;
  const Carrito = window.Carrito;

  // apiUrl vacio significa mismo origen, que es el caso normal en produccion.
  const api = (ruta) => `${cfg.apiUrl.replace(/\/+$/, "")}${ruta}`;

  const nodos = {
    form: document.getElementById("form-checkout"),
    lista: document.getElementById("resumen-lista"),
    subtotal: document.getElementById("resumen-subtotal"),
    envio: document.getElementById("resumen-envio"),
    total: document.getElementById("resumen-total"),
    error: document.getElementById("error-checkout"),
    boton: document.getElementById("btn-pagar"),
  };

  function mostrarError(mensaje) {
    nodos.error.hidden = !mensaje;
    nodos.error.textContent = mensaje || "";
  }

  function pintarResumen() {
    const items = Carrito.obtener();
    if (items.length === 0) {
      window.location.replace("index.html");
      return;
    }

    const subtotal = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
    const envio = subtotal >= cfg.envioGratisDesde ? 0 : cfg.envioFijo;

    nodos.lista.innerHTML = items
      .map(
        (i) => `<li class="resumen-item">
          <span class="resumen-item__nombre">${escapar(i.nombre)}</span>
          <span class="resumen-item__cantidad">x${i.cantidad}</span>
          <span class="resumen-item__precio">${precio(i.cantidad * i.precio)}</span>
        </li>`
      )
      .join("");

    nodos.subtotal.textContent = precio(subtotal);
    nodos.envio.textContent = envio === 0 ? "Gratis" : precio(envio);
    nodos.total.textContent = precio(subtotal + envio);
  }

  async function enviar(e) {
    e.preventDefault();
    mostrarError("");

    const datos = new FormData(nodos.form);
    const items = Carrito.obtener().map((i) => ({ id: i.id, cantidad: i.cantidad }));

    const email = String(datos.get("email") ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
      mostrarError("Revisa el email: no parece una direccion valida.");
      return;
    }
    if (!String(datos.get("nombre") ?? "").trim()) {
      mostrarError("Falta tu nombre.");
      return;
    }

    const subtotal = items.reduce(
      (s, i) => s + i.cantidad * (Carrito.obtener().find((x) => x.id === i.id)?.precio ?? 0),
      0
    );

    nodos.boton.disabled = true;
    nodos.boton.textContent = "Redirigiendo al pago...";

    try {
      const res = await fetch(api("/api/checkout"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items,
          email,
          nombre: String(datos.get("nombre") ?? "").trim(),
          telefono: String(datos.get("telefono") ?? "").trim(),
          documento: String(datos.get("documento") ?? "").trim(),
          pasarela: String(datos.get("pasarela") ?? cfg.pasarelaPorDefecto),
          sandbox: cfg.sandbox,
          envioGratis: subtotal >= cfg.envioGratisDesde,
        }),
      });

      const r = await res.json();

      if (!res.ok) {
        const detalle = Array.isArray(r.detalles) ? r.detalles.join(" ") : "";
        mostrarError(
          (r.error || "No pudimos crear el pago.") + (detalle ? ` ${detalle}` : "")
        );
        nodos.boton.disabled = false;
        nodos.boton.textContent = "Pagar";
        return;
      }

      if (!r.url) {
        mostrarError("La pasarela no devolvio una URL de pago.");
        nodos.boton.disabled = false;
        nodos.boton.textContent = "Pagar";
        return;
      }

      // No se limpia el carrito: si el pago falla, el cliente no pierde su
      // seleccion. Se limpia en gracias.html, cuando la pasarela confirma.
      window.location.href = r.url;
    } catch (err) {
      mostrarError(
        "No pudimos conectarnos con el servidor de pago. Revisa tu conexion."
      );
      nodos.boton.disabled = false;
      nodos.boton.textContent = "Pagar";
      console.error(err);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    pintarResumen();
    nodos.form.addEventListener("submit", enviar);
  });
})();
