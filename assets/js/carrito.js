/**
 * Carrito de compra persistido en localStorage.
 * Sin backend: el checkout real se integra despues.
 */
(function (global) {
  "use strict";

  const CLAVE = "tienda:carrito:v1";
  const oyentes = new Set();

  function leer() {
    try {
      const crudo = localStorage.getItem(CLAVE);
      const datos = crudo ? JSON.parse(crudo) : [];
      return Array.isArray(datos) ? datos : [];
    } catch (e) {
      return [];
    }
  }

  function guardar(items) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(items));
    } catch (e) {
      /* sin espacio o storage bloqueado */
    }
    oyentes.forEach((fn) => fn(items));
  }

  const Carrito = {
    obtener: leer,

    agregar(producto, cantidad = 1) {
      const items = leer();
      const existente = items.find((i) => i.id === producto.id);
      if (existente) {
        existente.cantidad = Math.min(
          existente.cantidad + cantidad,
          producto.stock
        );
        existente.precio = producto.precio;
        existente.nombre = producto.nombre;
        existente.imagen = producto.imagen;
      } else {
        items.push({
          id: producto.id,
          nombre: producto.nombre,
          imagen: producto.imagen,
          precio: producto.precio,
          cantidad: Math.min(cantidad, producto.stock),
          stock: producto.stock,
        });
      }
      guardar(items);
    },

    fijarCantidad(id, cantidad) {
      const items = leer()
        .map((i) =>
          i.id === id
            ? { ...i, cantidad: Math.max(0, Math.min(cantidad, i.stock)) }
            : i
        )
        .filter((i) => i.cantidad > 0);
      guardar(items);
    },

    quitar(id) {
      guardar(leer().filter((i) => i.id !== id));
    },

    vaciar() {
      guardar([]);
    },

    cantidadTotal() {
      return leer().reduce((suma, i) => suma + i.cantidad, 0);
    },

    subtotal() {
      return leer().reduce((suma, i) => suma + i.cantidad * i.precio, 0);
    },

    alCambiar(fn) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
  };

  global.Carrito = Carrito;
})(window);
