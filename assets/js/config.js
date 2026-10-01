/**
 * Configuracion central de la tienda.
 * Cambia aqui los datos de negocio sin tocar el resto del codigo.
 */
window.CONFIG = {
  store: {
    nombre: "Ascua",
    tagline: "Productos que llegan antes de que te canses de buscarlos",
    email: "hola@ascua.test",
    whatsapp: "",
    moneda: "CLP",
    simbolo: "$",
    // CLP no usa decimales. Si cambias a USD, pon 2.
    decimales: 0,
  },

  checkout: {
    // URL del Worker. En local: http://127.0.0.1:8787
    apiUrl: "http://127.0.0.1:8787",
    pasarelaPorDefecto: "mercadopago",
    // Cambia a false cuando tengas credenciales de produccion.
    sandbox: true,
    envioGratisDesde: 30000,
    envioFijo: 3990,
  },

  catalogo: {
    // Fuente de datos: "json" (archivo local) o "api" (proveedor remoto).
    fuente: "json",
    // Archivo local generado por `npm run sync` o editado a mano.
    archivoLocal: "data/productos.json",
    // Clave de cache en localStorage y su vigencia en minutos.
    cacheMinutos: 30,
    productosPorPagina: 12,
  },

  proveedores: {
    aliexpress: {
      activo: false,
      // Requiere proxy CORS: una pagina estatica no puede llamar APIs con
      // credenciales en el navegador. Configura la URL de tu proxy aqui.
      baseUrl: "https://TU-PROXY.example.com/aliexpress",
      apiKey: "",
      limite: 50,
    },
    cjdropshipping: {
      activo: false,
      baseUrl: "https://api.cjdcropshipping.com",
      apiKey: "",
      limite: 50,
    },
  },
};
