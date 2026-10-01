/**
 * Logica de la pagina principal: render del catalogo, filtros, busqueda,
 * orden y contador del carrito.
 */
(function () {
  "use strict";

  const { escapar, precio, descuento, imagenSegura, estrellas, avisar } =
    window.UI;
  const config = window.CONFIG;

  const nodos = {
    grid: document.getElementById("grid-productos"),
    estado: document.getElementById("estado-catalogo"),
    buscador: document.getElementById("buscador"),
    categorias: document.getElementById("filtro-categorias"),
    orden: document.getElementById("orden"),
    cantidadCarrito: document.getElementById("cantidad-carrito"),
    mas: document.getElementById("cargar-mas"),
  };

  let catalogo = [];
  let categoriaActiva = "todas";
  let termino = "";
  let orden = "relevancia";
  let visibles = config.catalogo.productosPorPagina;

  function aplicarFiltros() {
    const texto = termino.trim().toLowerCase();
    let lista = catalogo.filter((p) => {
      const coincideCategoria =
        categoriaActiva === "todas" || p.categoria === categoriaActiva;
      const coincideTexto =
        !texto ||
        p.nombre.toLowerCase().includes(texto) ||
        p.descripcion.toLowerCase().includes(texto) ||
        p.etiquetas.some((e) => e.toLowerCase().includes(texto));
      return coincideCategoria && coincideTexto;
    });

    const porPrecio = (a, b) => a.precio - b.precio;
    const porPopularidad = (a, b) => b.ventas - a.ventas;
    const porPuntuacion = (a, b) => b.rating - a.rating;
    const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");

    const opciones = {
      relevancia: porPopularidad,
      "precio-asc": porPrecio,
      "precio-desc": (a, b) => -a.precio + b.precio,
      puntuacion: porPuntuacion,
      nombre: porNombre,
    };
    return lista.sort(opciones[orden] || porPopularidad);
  }

  function tarjeta(p) {
    const dto = descuento(p.precio, p.precioComparacion);
    const imagen = imagenSegura(p.imagen, p.nombre);
    const agotado = p.stock <= 0;

    return `
      <article class="tarjeta" data-id="${escapar(p.id)}">
        <a class="tarjeta__enlace" href="producto.html?id=${encodeURIComponent(p.id)}">
          <div class="tarjeta__media">
            ${
              imagen
                ? imagen
                : '<div class="tarjeta__placeholder" aria-hidden="true"></div>'
            }
            ${dto > 0 ? `<span class="insignia insignia--oferta">-${dto}%</span>` : ""}
            ${agotado ? '<span class="insignia insignia--agotado">Agotado</span>' : ""}
          </div>
          <div class="tarjeta__cuerpo">
            <p class="tarjeta__categoria">${escapar(p.categoria)}</p>
            <h3 class="tarjeta__titulo">${escapar(p.nombre)}</h3>
            <p class="tarjeta__rating" aria-label="Puntuacion ${p.rating} de 5">
              <span class="estrellas">${estrellas(p.rating)}</span>
              <span class="tarjeta__ventas">${p.ventas} vendidos</span>
            </p>
            <div class="tarjeta__precios">
              <span class="precio">${precio(p.precio)}</span>
              ${
                p.precioComparacion
                  ? `<s class="precio tachado">${precio(p.precioComparacion)}</s>`
                  : ""
              }
            </div>
            <p class="tarjeta__envio">Llega en ~${p.envioDias} dias</p>
          </div>
        </a>
        <button class="boton boton--primario boton--ancho" data-agregar="${escapar(p.id)}" ${
          agotado ? "disabled" : ""
        }>
          ${agotado ? "Sin stock" : "Agregar al carrito"}
        </button>
      </article>`;
  }

  function render() {
    const lista = aplicarFiltros();

    if (lista.length === 0) {
      nodos.estado.hidden = false;
      nodos.estado.textContent = "No encontramos productos con ese criterio.";
      nodos.grid.innerHTML = "";
      nodos.mas.hidden = true;
      return;
    }

    const porPagina = config.catalogo.productosPorPagina;
    const aMostrar = lista.slice(0, visibles);
    const restantes = lista.length - aMostrar.length;

    nodos.estado.hidden = true;
    nodos.grid.innerHTML = aMostrar.map(tarjeta).join("");

    nodos.mas.hidden = restantes <= 0;
    nodos.mas.textContent = `Cargar mas productos (${restantes} restantes)`;
  }

  function renderCategorias() {
    const categorias = window.TiendaAPI.categorias(catalogo);
    const opciones = [
      '<button class="chip chip--activo" data-categoria="todas">Todos</button>',
      ...categorias.map(
        (c) =>
          `<button class="chip" data-categoria="${escapar(c)}">${escapar(
            c
          )}</button>`
      ),
    ];
    nodos.categorias.innerHTML = opciones.join("");
  }

  function sincronizarContador() {
    nodos.cantidadCarrito.textContent = String(window.Carrito.cantidadTotal());
    nodos.cantidadCarrito.hidden = window.Carrito.cantidadTotal() === 0;
  }

  async function iniciar() {
    try {
      catalogo = await window.TiendaAPI.obtenerCatalogo();
    } catch (e) {
      nodos.estado.hidden = false;
      nodos.estado.textContent =
        "No pudimos cargar el catalogo. Revisa data/productos.json o abre la tienda con un servidor local (npm start).";
      console.error(e);
      return;
    }

    renderCategorias();
    render();
    sincronizarContador();
    window.Carrito.alCambiar(sincronizarContador);

    let temporizador;
    nodos.buscador.addEventListener("input", (e) => {
      clearTimeout(temporizador);
      const valor = e.target.value;
      temporizador = setTimeout(() => {
        termino = valor;
        visibles = config.catalogo.productosPorPagina;
        render();
      }, 180);
    });

    nodos.categorias.addEventListener("click", (e) => {
      const boton = e.target.closest("[data-categoria]");
      if (!boton) return;
      categoriaActiva = boton.dataset.categoria;
      visibles = config.catalogo.productosPorPagina;
      nodos.categorias
        .querySelectorAll(".chip")
        .forEach((c) => c.classList.toggle("chip--activo", c === boton));
      render();
    });

    nodos.orden.addEventListener("change", (e) => {
      orden = e.target.value;
      visibles = config.catalogo.productosPorPagina;
      render();
    });

    nodos.mas.addEventListener("click", () => {
      visibles += config.catalogo.productosPorPagina;
      render();
    });

    nodos.grid.addEventListener("click", (e) => {
      const boton = e.target.closest("[data-agregar]");
      if (!boton) return;
      const producto = catalogo.find((p) => p.id === boton.dataset.agregar);
      if (!producto) return;
      window.Carrito.agregar(producto, 1);
      avisar(`${producto.nombre} agregado al carrito`);
    });
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
