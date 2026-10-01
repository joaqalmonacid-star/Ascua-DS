/**
 * Logica de la ficha de producto: carga por query param, galeria,
 * selector de cantidad y agregado al carrito.
 */
(function () {
  "use strict";

  const { escapar, precio, descuento, imagenSegura, param, estrellas, avisar } =
    window.UI;

  async function iniciar() {
    const id = param("id");
    const contenedor = document.getElementById("ficha");

    if (!id) {
      contenedor.innerHTML = `
        <p class="aviso aviso--error">Falta el identificador del producto.
        <a href="index.html">Volver al catalogo</a></p>`;
      return;
    }

    let producto;
    try {
      const catalogo = await window.TiendaAPI.obtenerCatalogo();
      producto = catalogo.find((p) => p.id === id);
    } catch (e) {
      contenedor.innerHTML = `<p class="aviso aviso--error">No pudimos cargar el catalogo.</p>`;
      return;
    }

    if (!producto) {
      contenedor.innerHTML = `
        <p class="aviso aviso--error">Producto no encontrado.
        <a href="index.html">Volver al catalogo</a></p>`;
      return;
    }

    document.title = `${producto.nombre} | ${window.CONFIG.store.nombre}`;
    renderFicha(contenedor, producto);
  }

  function renderFicha(contenedor, producto) {
    const galeria = [producto.imagen, ...(producto.imagenes || [])].filter(
      Boolean
    );
    const principal = galeria[0];
    const dto = descuento(producto.precio, producto.precioComparacion);
    const agotado = producto.stock <= 0;

    contenedor.innerHTML = `
      <nav class="migas" aria-label="Ruta de navegacion">
        <a href="index.html">Catalogo</a> <span aria-hidden="true">/</span>
        <span>${escapar(producto.categoria)}</span> <span aria-hidden="true">/</span>
        <span aria-current="page">${escapar(producto.nombre)}</span>
      </nav>

      <div class="ficha">
        <div class="ficha__galeria">
          ${
            principal
              ? imagenSegura(principal, producto.nombre)
              : '<div class="tarjeta__placeholder" aria-hidden="true"></div>'
          }
          ${
            galeria.length > 1
              ? `<div class="ficha__miniaturas">${galeria
                  .map(
                    (url) =>
                      `<button class="miniatura" data-mini="${escapar(
                        url
                      )}">${imagenSegura(url, producto.nombre)}</button>`
                  )
                  .join("")}</div>`
              : ""
          }
        </div>

        <div class="ficha__detalle">
          <p class="ficha__categoria">${escapar(producto.categoria)}</p>
          <h1 class="ficha__titulo">${escapar(producto.nombre)}</h1>
          <p class="ficha__rating">
            <span class="estrellas">${estrellas(producto.rating)}</span>
            <span>${producto.rating} · ${producto.ventas} vendidos</span>
          </p>

          <div class="ficha__precios">
            <span class="precio precio--grande">${precio(producto.precio)}</span>
            ${
              producto.precioComparacion
                ? `<s class="precio tachado">${precio(producto.precioComparacion)}</s>`
                : ""
            }
            ${dto > 0 ? `<span class="insignia insignia--oferta">-${dto}%</span>` : ""}
          </div>

          <p class="ficha__descripcion">${escapar(producto.descripcion)}</p>

          <ul class="ficha__meta">
            <li>Envio estimado: <strong>${producto.envioDias} dias</strong></li>
            <li>Disponibilidad: <strong>${
              agotado ? "Agotado" : `${producto.stock} unidades`
            }</strong></li>
            <li>Proveedor: <strong>${escapar(producto.proveedor)}</strong></li>
            ${
              producto.sku
                ? `<li>SKU: <strong>${escapar(producto.sku)}</strong></li>`
                : ""
            }
          </ul>

          ${
            producto.etiquetas.length
              ? `<ul class="ficha__etiquetas">${producto.etiquetas
                  .map((e) => `<li class="chip chip--etiqueta">${escapar(e)}</li>`)
                  .join("")}</ul>`
              : ""
          }

          <form class="ficha__compra" id="form-compra">
            <label class="campo-cantidad">
              Cantidad
              <input type="number" id="cantidad" value="1" min="1" max="${
                producto.stock
              }" ${agotado ? "disabled" : ""}>
            </label>
            <button class="boton boton--primario" type="submit" ${
              agotado ? "disabled" : ""
            }>
              ${agotado ? "Sin stock" : "Agregar al carrito"}
            </button>
          </form>

          ${
            producto.urlOrigen
              ? `<a class="enlace-proveedor" href="${escapar(
                  producto.urlOrigen
                )}" target="_blank" rel="noopener noreferrer">Ver en el proveedor</a>`
              : ""
          }
        </div>
      </div>`;

    const principalImg = contenedor.querySelector(".ficha__galeria img");
    contenedor.querySelectorAll("[data-mini]").forEach((boton) => {
      boton.addEventListener("click", () => {
        if (principalImg) {
          principalImg.src = boton.dataset.mini;
          principalImg.classList.remove("is-broken");
        }
      });
    });

    const form = document.getElementById("form-compra");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const cantidad = Math.max(
        1,
        Math.min(
          Number(document.getElementById("cantidad").value) || 1,
          producto.stock
        )
      );
      window.Carrito.agregar(producto, cantidad);
      avisar(`${cantidad} x ${producto.nombre} agregado al carrito`);
    });
  }

  function sincronizarContador() {
    const nodo = document.getElementById("cantidad-carrito");
    if (!nodo) return;
    const total = window.Carrito.cantidadTotal();
    nodo.textContent = String(total);
    nodo.hidden = total === 0;
  }

  document.addEventListener("DOMContentLoaded", () => {
    sincronizarContador();
    window.Carrito.alCambiar(sincronizarContador);
    iniciar();
  });
})();
