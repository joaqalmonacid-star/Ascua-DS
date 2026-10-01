/**
 * Panel lateral del carrito: listado, cantidades, subtotal y vaciado.
 */
(function () {
  "use strict";

  const { escapar, precio, imagenSegura } = window.UI;
  const Carrito = window.Carrito;

  let panel, fondo, botonAbrir;

  function abrir() {
    if (!panel) return;
    panel.hidden = false;
    fondo.hidden = false;
    document.body.classList.add("sin-scroll");
    botonAbrir?.focus();
  }

  function cerrar() {
    if (!panel) return;
    panel.hidden = true;
    fondo.hidden = true;
    document.body.classList.remove("sin-scroll");
  }

  function pintar() {
    const items = Carrito.obtener();
    const lista = document.getElementById("carrito-lista");
    const vacio = document.getElementById("carrito-vacio");
    const pie = document.getElementById("carrito-pie");

    if (items.length === 0) {
      lista.innerHTML = "";
      vacio.hidden = false;
      pie.hidden = true;
      return;
    }

    vacio.hidden = true;
    pie.hidden = false;
    lista.innerHTML = items
      .map(
        (i) => `
        <li class="linea">
          <div class="linea__media">${
            imagenSegura(i.imagen, i.nombre) || '<span class="linea__vacia"></span>'
          }</div>
          <div class="linea__info">
            <p class="linea__nombre">${escapar(i.nombre)}</p>
            <p class="linea__precio">${precio(i.precio)} c/u</p>
            <div class="linea__controles">
              <button class="boton boton--icono" data-restar="${escapar(
                i.id
              )}" aria-label="Quitar una unidad">−</button>
              <span class="linea__cantidad">${i.cantidad}</span>
              <button class="boton boton--icono" data-sumar="${escapar(
                i.id
              )}" aria-label="Agregar una unidad"
                ${i.cantidad >= i.stock ? "disabled" : ""}>+</button>
              <button class="boton boton--enlace" data-quitar="${escapar(
                i.id
              )}">Quitar</button>
            </div>
          </div>
          <span class="linea__total">${precio(i.cantidad * i.precio)}</span>
        </li>`
      )
      .join("");

    document.getElementById("carrito-subtotal").textContent = precio(
      Carrito.subtotal()
    );
  }

  function iniciar() {
    panel = document.getElementById("carrito-panel");
    fondo = document.getElementById("carrito-fondo");
    botonAbrir = document.getElementById("carrito-boton");

    if (!panel) return;

    botonAbrir.addEventListener("click", abrir);
    document
      .getElementById("carrito-cerrar")
      .addEventListener("click", cerrar);
    fondo.addEventListener("click", cerrar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) cerrar();
    });

    panel.addEventListener("click", (e) => {
      const restar = e.target.closest("[data-restar]");
      const sumar = e.target.closest("[data-sumar]");
      const quitar = e.target.closest("[data-quitar]");
      if (restar) {
        const item = Carrito.obtener().find((i) => i.id === restar.dataset.restar);
        if (item) Carrito.fijarCantidad(item.id, item.cantidad - 1);
      } else if (sumar) {
        const item = Carrito.obtener().find((i) => i.id === sumar.dataset.sumar);
        if (item) Carrito.fijarCantidad(item.id, item.cantidad + 1);
      } else if (quitar) {
        Carrito.quitar(quitar.dataset.quitar);
      } else if (e.target.closest("#carrito-vaciar")) {
        if (confirm("Vaciar el carrito?")) Carrito.vaciar();
      }
    });

    Carrito.alCambiar(pintar);
    pintar();
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
