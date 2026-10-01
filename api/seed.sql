-- Precios iniciales. Los IDs coinciden con data/productos.json.
-- `sync` regenera estos valores; esta tabla es la fuente de verdad para cobrar.
INSERT OR REPLACE INTO productos
  (id, nombre, precio, stock, sku, url_origen, activo, updated_at)
VALUES
  ('prod-001', 'Lampara LED minimalista',     29990, 120, 'LAM-001', '', 1, datetime('now')),
  ('prod-002', 'Taza de ceramica mate',       15990, 250, 'TAZ-002', '', 1, datetime('now')),
  ('prod-003', 'Funda para telefono',         24990, 180, 'FUN-003', '', 1, datetime('now')),
  ('prod-004', 'Bloc de notas A5 reciclado',  14500, 300, 'BLO-004', '', 1, datetime('now')),
  ('prod-005', 'Soporte portatil aluminio',   44990,  90, 'SOP-005', '', 1, datetime('now')),
  ('prod-006', 'Botella acero 750ml',         34990, 140, 'BOT-006', '', 1, datetime('now'));
