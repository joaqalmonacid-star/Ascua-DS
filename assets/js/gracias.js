/**
 * Pagina de retorno tras el pago. Muestra el estado y limpia el carrito.
 *
 * Importante: esta pagina NO decide si el pago fue aprobado. La pasarela
 * redirige aqui tanto en exito como en rechazo, asi que el texto se mantiene
 * honesto y espera al webhook, que es la unica fuente de verdad.
 */
(function () {
  "use strict";

  const { escapar, precio, param } = window.UI;

  function plantilla({ titulo, texto, estado, pedidoId }) {
    return `
      <div class="gracias__icono" aria-hidden="true">${estado}</div>
      <h1>${escapar(titulo)}</h1>
      <p>${escapar(texto)}</p>
      ${pedidoId ? `<p class="gracias__pedido">Pedido <code>${escapar(pedidoId)}</code></p>` : ""}
      <p class="gracias__nota">
        Si el pago se aprobo, te llega un email de confirmacion en unos minutos.
        Si cancelaste, no se realizo ningun cargo.
      </p>
      <div class="gracias__acciones">
        <a class="boton boton--primario" href="index.html">Seguir comprando</a>
      </div>`;
  }

  function iniciar() {
    const pedidoId = param("pedido");
    const pendiente = param("estado") === "pendiente";
    const contenedor = document.getElementById("gracias");

    // El carrito se limpia aca y no antes: si el pago falla, el cliente
    // vuelve desde la pasarela y deberia encontrar sus productos.
    window.Carrito.vaciar();

    if (pendiente) {
      contenedor.innerHTML = plantilla({
        titulo: "Pago en revision",
        texto:
          "Tu pago esta siendo verificado. Te escribimos al email del pedido en cuanto se confirme.",
        estado: "?",
        pedidoId,
      });
      return;
    }

    contenedor.innerHTML = plantilla({
      titulo: "Gracias por tu compra",
      texto: "Estamos preparando tu pedido. Te avisamos cuando salga del proveedor.",
      estado: "+",
      pedidoId,
    });
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
