/**
 * Utilidades de presentacion: formato de precio, escapado de HTML,
 * edicion de URLs y helpers de render compartidos.
 */
(function (global) {
  "use strict";

  const config = global.CONFIG;

  function escapar(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, (c) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function precio(valor) {
    const numero = Number(valor) || 0;
    const decimales = config.store.decimales ?? 2;
    return (
      config.store.simbolo +
      numero.toLocaleString("es-CL", {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      })
    );
  }

  function descuento(precioActual, precioComparacion) {
    if (!precioComparacion || precioComparacion <= precioActual) return 0;
    return Math.round((1 - precioActual / precioComparacion) * 100);
  }

  function imagenSegura(url, alt) {
    const limpio = typeof url === "string" ? url.trim() : "";
    const esHttp = /^https?:\/\//i.test(limpio);
    const esDataSvg = /^data:image\/(svg\+xml|png|jpe?g|webp);/i.test(limpio);
    const rutaInterna = limpio.startsWith("/") || limpio.startsWith("./");
    const src = esHttp || esDataSvg || (limpio && rutaInterna) ? limpio : "";
    if (!src) return "";
    return `<img src="${escapar(src)}" alt="${escapar(
      alt
    )}" loading="lazy" decoding="async" onerror="this.removeAttribute('src');this.classList.add('is-broken')">`;
  }

  function param(nombre) {
    return new URLSearchParams(global.location.search).get(nombre);
  }

  function estrellas(rating) {
    const completa = Math.round(Number(rating) || 0);
    return "★".repeat(completa) + "☆".repeat(Math.max(0, 5 - completa));
  }

  function avisar(mensaje) {
    let toast = document.getElementById("toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.className = "toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = mensaje;
    toast.classList.add("toast--visible");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove("toast--visible"), 2200);
  }

  global.UI = {
    escapar,
    precio,
    descuento,
    imagenSegura,
    param,
    estrellas,
    avisar,
  };
})(window);
