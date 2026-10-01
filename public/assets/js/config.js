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
    // Vacio = mismo origen. En produccion el Worker y el sitio se sirven desde
    // el mismo dominio, asi que basta con las rutas relativas.
    // En local, pon "http://127.0.0.1:8787" y levanta el Worker aparte.
    apiUrl: "",
    pasarelaPorDefecto: "mercadopago",
    // true = credenciales de prueba de Mercado Pago y Flow.
    // Ponlo en false cuando cargues las de produccion.
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
