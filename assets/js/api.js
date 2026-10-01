/**
 * Capa de datos: unica pieza que sabe de donde vienen los productos.
 * El resto de la tienda solo consume `TiendaAPI.obtenerCatalogo()`.
 */
(function (global) {
  "use strict";

  const config = global.CONFIG;
  const CLAVE_CACHE = "tienda:catalogo:v1";

  function esValido(producto) {
    return (
      producto &&
      typeof producto.id === "string" &&
      Number.isFinite(Number(producto.precio)) &&
      Number(producto.precio) >= 0
    );
  }

  /** Normaliza el registro de cualquier proveedor a la forma de la tienda. */
  function normalizar(bruto, origen) {
    const precio = Number(bruto.precio ?? bruto.salePrice ?? bruto.price ?? 0);
    const precioComparacion = Number(
      bruto.precioComparacion ?? bruto.originalPrice ?? 0
    );
    return {
      id: String(bruto.id ?? bruto.productId ?? crypto.randomUUID()),
      nombre: String(bruto.nombre ?? bruto.title ?? "Producto sin titulo").trim(),
      descripcion: String(bruto.descripcion ?? bruto.description ?? "").trim(),
      precio,
      precioComparacion: precioComparacion > precio ? precioComparacion : null,
      imagen: bruto.imagen ?? bruto.image ?? "",
      imagenes: Array.isArray(bruto.imagenes) ? bruto.imagenes : [],
      categoria: bruto.categoria ?? "general",
      etiquetas: Array.isArray(bruto.etiquetas) ? bruto.etiquetas : [],
      stock: Number.isFinite(Number(bruto.stock)) ? Number(bruto.stock) : 100,
      envioDias: Number(bruto.envioDias ?? 12),
      rating: Number(bruto.rating ?? 4.5),
      ventas: Number(bruto.ventas ?? 0),
      proveedor: origen,
      sku: bruto.sku ?? bruto.productSku ?? "",
      urlOrigen: bruto.urlOrigen ?? bruto.productUrl ?? "",
    };
  }

  function leerCache() {
    try {
      const crudo = localStorage.getItem(CLAVE_CACHE);
      if (!crudo) return null;
      const { guardado, productos } = JSON.parse(crudo);
      const minutos = config.catalogo.cacheMinutos;
      if (Date.now() - guardado > minutos * 60_000) return null;
      return productos;
    } catch (e) {
      return null;
    }
  }

  function escribirCache(productos) {
    try {
      localStorage.setItem(
        CLAVE_CACHE,
        JSON.stringify({ guardado: Date.now(), productos })
      );
    } catch (e) {
      /* cache llena o bloqueada: no es critico */
    }
  }

  async function desdeJson() {
    const url = config.catalogo.archivoLocal;
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(`No se pudo leer ${url} (HTTP ${res.status})`);
    }
    const datos = await res.json();
    const lista = Array.isArray(datos) ? datos : datos.productos;
    if (!Array.isArray(lista)) {
      throw new Error(`${url} no contiene un array de productos`);
    }
    return lista.map((p) => normalizar(p, p.proveedor ?? "local"));
  }

  async function desdeApi() {
    const proveedores = Object.entries(config.proveedores).filter(
      ([, cfg]) => cfg.activo && cfg.apiKey
    );
    if (proveedores.length === 0) {
      throw new Error("Ningun proveedor activo. Revisa CONFIG.proveedores.");
    }
    const [nombre, cfg] = proveedores[0];
    const url = new URL(cfg.baseUrl);
    url.searchParams.set("limit", String(cfg.limite));
    url.searchParams.set("key", cfg.apiKey);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${nombre} respondio HTTP ${res.status}`);
    const datos = await res.json();
    const lista = datos.productos ?? datos.data ?? datos.items ?? datos;
    return lista.map((p) => normalizar(p, nombre));
  }

  const TiendaAPI = {
    async obtenerCatalogo({ refrescar = false } = {}) {
      if (!refrescar) {
        const cacheado = leerCache();
        if (cacheado) return cacheado;
      }
      const origen = config.catalogo.fuente;
      const productos =
        origen === "api" ? await desdeApi() : await desdeJson();
      const validos = productos.filter(esValido);
      escribirCache(validos);
      return validos;
    },

    invalidarCache() {
      try {
        localStorage.removeItem(CLAVE_CACHE);
      } catch (e) {
        /* sin cache disponible */
      }
    },

    categorias(productos) {
      return [...new Set(productos.map((p) => p.categoria))].sort();
    },
  };

  global.TiendaAPI = TiendaAPI;
})(window);
