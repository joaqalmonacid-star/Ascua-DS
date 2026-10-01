-- Pedidos. El total se guarda ya calculado en CLP para que el histórico no
-- cambie si mañana editas precios.
CREATE TABLE IF NOT EXISTS pedidos (
  id                TEXT PRIMARY KEY,
  external_id       TEXT,
  pasarela          TEXT NOT NULL,
  estado            TEXT NOT NULL,
  email             TEXT NOT NULL,
  nombre            TEXT NOT NULL,
  telefono          TEXT,
  documento         TEXT,
  total             INTEGER NOT NULL,
  envio             INTEGER NOT NULL DEFAULT 0,
  items             TEXT NOT NULL,
  envio_direccion   TEXT,
  proveedor         TEXT,
  tracking_proveedor TEXT,
  tracking_cliente   TEXT,
  notified_owner    INTEGER NOT NULL DEFAULT 0,
  notified_buyer    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  paid_at           TEXT,
  shipped_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_external ON pedidos(pasarela, external_id);

-- Precios de referencia. El Worker cobra desde aqui, nunca desde el navegador:
-- el cliente solo manda ids y cantidades, nunca precios.
CREATE TABLE IF NOT EXISTS productos (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  precio      INTEGER NOT NULL,
  stock       INTEGER NOT NULL DEFAULT 0,
  sku         TEXT,
  url_origen  TEXT,
  activo      INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT
);

-- Idempotencia: las pasarelas reenvian webhooks. Sin esto, un reenvio
-- duplica el aviso por email.
CREATE TABLE IF NOT EXISTS webhooks_vistos (
  firma      TEXT PRIMARY KEY,
  recibido_at TEXT NOT NULL
);
