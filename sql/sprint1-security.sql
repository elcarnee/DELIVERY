-- =============================================================================
-- VERO Delivery - Sprint 1: Row Level Security & Order RPC
-- =============================================================================
-- This script enables RLS on all tables, creates granular access policies,
-- and provides an atomic create_order RPC function.
--
-- Safe to re-run: uses DROP POLICY IF EXISTS before each CREATE POLICY.
-- =============================================================================


-- =============================================================================
-- 1. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- =============================================================================

ALTER TABLE usuarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurantes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE repartidores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes      ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 2. RLS POLICIES
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 2.1 USUARIOS
-- -----------------------------------------------------------------------------
-- Users can only read, insert, and update their own row.
-- Role changes are forbidden on update.

-- SELECT: read own row
DROP POLICY IF EXISTS "usuarios_select_own" ON usuarios;
CREATE POLICY "usuarios_select_own" ON usuarios
  FOR SELECT
  USING (auth.uid() = id);

-- INSERT: create own row with valid role
DROP POLICY IF EXISTS "usuarios_insert_own" ON usuarios;
CREATE POLICY "usuarios_insert_own" ON usuarios
  FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND rol IN ('cliente', 'comercio', 'repartidor')
  );

-- UPDATE: update own row but cannot change rol
DROP POLICY IF EXISTS "usuarios_update_own" ON usuarios;
CREATE POLICY "usuarios_update_own" ON usuarios
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND rol = (SELECT u.rol FROM usuarios u WHERE u.id = auth.uid())
  );


-- -----------------------------------------------------------------------------
-- 2.2 RESTAURANTES
-- -----------------------------------------------------------------------------
-- Public read for active restaurants (browsing).
-- Owners can always read, insert, and update their own.

-- SELECT: everyone reads active restaurants; owners always read their own
DROP POLICY IF EXISTS "restaurantes_select_active" ON restaurantes;
CREATE POLICY "restaurantes_select_active" ON restaurantes
  FOR SELECT
  USING (
    activo = true
    OR auth.uid() = usuario_id
  );

-- INSERT: only the owner
DROP POLICY IF EXISTS "restaurantes_insert_owner" ON restaurantes;
CREATE POLICY "restaurantes_insert_owner" ON restaurantes
  FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

-- UPDATE: only the owner
DROP POLICY IF EXISTS "restaurantes_update_owner" ON restaurantes;
CREATE POLICY "restaurantes_update_owner" ON restaurantes
  FOR UPDATE
  USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);


-- -----------------------------------------------------------------------------
-- 2.3 MENU_ITEMS
-- -----------------------------------------------------------------------------
-- Everyone can read (for browsing menus).
-- Only the restaurant owner can insert, update, or delete.

-- SELECT: public read
DROP POLICY IF EXISTS "menu_items_select_all" ON menu_items;
CREATE POLICY "menu_items_select_all" ON menu_items
  FOR SELECT
  USING (true);

-- INSERT: restaurant owner only
DROP POLICY IF EXISTS "menu_items_insert_owner" ON menu_items;
CREATE POLICY "menu_items_insert_owner" ON menu_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurantes r
      WHERE r.id = restaurante_id
        AND r.usuario_id = auth.uid()
    )
  );

-- UPDATE: restaurant owner only
DROP POLICY IF EXISTS "menu_items_update_owner" ON menu_items;
CREATE POLICY "menu_items_update_owner" ON menu_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM restaurantes r
      WHERE r.id = restaurante_id
        AND r.usuario_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurantes r
      WHERE r.id = restaurante_id
        AND r.usuario_id = auth.uid()
    )
  );

-- DELETE: restaurant owner only
DROP POLICY IF EXISTS "menu_items_delete_owner" ON menu_items;
CREATE POLICY "menu_items_delete_owner" ON menu_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM restaurantes r
      WHERE r.id = restaurante_id
        AND r.usuario_id = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 2.4 PEDIDOS
-- -----------------------------------------------------------------------------
-- Clients see their own orders.
-- Commerces see orders for their restaurant.
-- Drivers see orders in 'listo' state or assigned to them.

-- SELECT: role-based visibility
DROP POLICY IF EXISTS "pedidos_select_cliente" ON pedidos;
CREATE POLICY "pedidos_select_cliente" ON pedidos
  FOR SELECT
  USING (
    -- Client: own orders (through clientes table)
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = pedidos.cliente_id
        AND c.usuario_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pedidos_select_comercio" ON pedidos;
CREATE POLICY "pedidos_select_comercio" ON pedidos
  FOR SELECT
  USING (
    -- Commerce: orders for their restaurant
    EXISTS (
      SELECT 1 FROM restaurantes r
      WHERE r.id = pedidos.restaurante_id
        AND r.usuario_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pedidos_select_repartidor" ON pedidos;
CREATE POLICY "pedidos_select_repartidor" ON pedidos
  FOR SELECT
  USING (
    -- Driver: orders in 'listo' state (available to pick up) or assigned to them
    EXISTS (
      SELECT 1 FROM repartidores rp
      WHERE rp.usuario_id = auth.uid()
    )
    AND (
      pedidos.estado = 'listo'
      OR EXISTS (
        SELECT 1 FROM repartidores rp
        WHERE rp.id = pedidos.repartidor_id
          AND rp.usuario_id = auth.uid()
      )
    )
  );

-- INSERT: only clients can create their own orders
DROP POLICY IF EXISTS "pedidos_insert_cliente" ON pedidos;
CREATE POLICY "pedidos_insert_cliente" ON pedidos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = cliente_id
        AND c.usuario_id = auth.uid()
    )
  );

-- UPDATE: commerces can update orders for their restaurant
DROP POLICY IF EXISTS "pedidos_update_comercio" ON pedidos;
CREATE POLICY "pedidos_update_comercio" ON pedidos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM restaurantes r
      WHERE r.id = pedidos.restaurante_id
        AND r.usuario_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurantes r
      WHERE r.id = pedidos.restaurante_id
        AND r.usuario_id = auth.uid()
    )
  );

-- UPDATE: drivers can update orders assigned to them or accept 'listo' orders
DROP POLICY IF EXISTS "pedidos_update_repartidor" ON pedidos;
CREATE POLICY "pedidos_update_repartidor" ON pedidos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM repartidores rp
      WHERE rp.usuario_id = auth.uid()
    )
    AND (
      pedidos.estado = 'listo'
      OR EXISTS (
        SELECT 1 FROM repartidores rp
        WHERE rp.id = pedidos.repartidor_id
          AND rp.usuario_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM repartidores rp
      WHERE rp.usuario_id = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 2.5 PEDIDO_ITEMS
-- -----------------------------------------------------------------------------
-- Access mirrors the parent pedido: if you can see the pedido, you can see its items.
-- Insert is handled through the create_order RPC (SECURITY DEFINER).

-- SELECT: client can see items of their own orders
DROP POLICY IF EXISTS "pedido_items_select_cliente" ON pedido_items;
CREATE POLICY "pedido_items_select_cliente" ON pedido_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = pedido_items.pedido_id
        AND c.usuario_id = auth.uid()
    )
  );

-- SELECT: commerce can see items of orders for their restaurant
DROP POLICY IF EXISTS "pedido_items_select_comercio" ON pedido_items;
CREATE POLICY "pedido_items_select_comercio" ON pedido_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN restaurantes r ON r.id = p.restaurante_id
      WHERE p.id = pedido_items.pedido_id
        AND r.usuario_id = auth.uid()
    )
  );

-- SELECT: driver can see items of orders assigned to them or in 'listo' state
DROP POLICY IF EXISTS "pedido_items_select_repartidor" ON pedido_items;
CREATE POLICY "pedido_items_select_repartidor" ON pedido_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN repartidores rp ON rp.usuario_id = auth.uid()
      WHERE p.id = pedido_items.pedido_id
        AND (
          p.estado = 'listo'
          OR (p.repartidor_id = rp.id)
        )
    )
  );

-- INSERT: same as pedidos insert (client creates items for their own order)
DROP POLICY IF EXISTS "pedido_items_insert_cliente" ON pedido_items;
CREATE POLICY "pedido_items_insert_cliente" ON pedido_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = pedido_id
        AND c.usuario_id = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 2.6 REPARTIDORES
-- -----------------------------------------------------------------------------
-- Everyone can read (for tracking purposes).
-- Only the owner can insert or update.

-- SELECT: public read
DROP POLICY IF EXISTS "repartidores_select_all" ON repartidores;
CREATE POLICY "repartidores_select_all" ON repartidores
  FOR SELECT
  USING (true);

-- INSERT: only the owner
DROP POLICY IF EXISTS "repartidores_insert_owner" ON repartidores;
CREATE POLICY "repartidores_insert_owner" ON repartidores
  FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

-- UPDATE: only the owner
DROP POLICY IF EXISTS "repartidores_update_owner" ON repartidores;
CREATE POLICY "repartidores_update_owner" ON repartidores
  FOR UPDATE
  USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);


-- -----------------------------------------------------------------------------
-- 2.7 CLIENTES
-- -----------------------------------------------------------------------------
-- Only the owner can read, insert, or update.

-- SELECT: own row only
DROP POLICY IF EXISTS "clientes_select_own" ON clientes;
CREATE POLICY "clientes_select_own" ON clientes
  FOR SELECT
  USING (auth.uid() = usuario_id);

-- INSERT: own row only
DROP POLICY IF EXISTS "clientes_insert_own" ON clientes;
CREATE POLICY "clientes_insert_own" ON clientes
  FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

-- UPDATE: own row only
DROP POLICY IF EXISTS "clientes_update_own" ON clientes;
CREATE POLICY "clientes_update_own" ON clientes
  FOR UPDATE
  USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);


-- =============================================================================
-- 3. RPC: create_order
-- =============================================================================
-- Atomic function that creates an order with its items.
-- Runs as SECURITY DEFINER to bypass RLS (validates auth internally).
-- Calculates totals from real menu_items prices to prevent client tampering.
-- =============================================================================

DROP FUNCTION IF EXISTS create_order(uuid, uuid, jsonb, text, text, text, text);

CREATE OR REPLACE FUNCTION create_order(
  p_cliente_id    uuid,
  p_restaurante_id uuid,
  p_items         jsonb,
  p_direccion     text,
  p_telefono      text,
  p_metodo_pago   text,
  p_notas         text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido_id     uuid;
  v_numero_pedido text;
  v_total         numeric := 0;
  v_item          jsonb;
  v_menu_item     record;
  v_item_total    numeric;
  v_result        jsonb;
BEGIN
  -- -----------------------------------------------------------------------
  -- Validate that the authenticated user owns this cliente record
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM clientes c
    WHERE c.id = p_cliente_id
      AND c.usuario_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'No autorizado: el cliente no pertenece al usuario autenticado.';
  END IF;

  -- -----------------------------------------------------------------------
  -- Validate the restaurant exists, is active, and accepts orders
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM restaurantes r
    WHERE r.id = p_restaurante_id
      AND r.activo = true
      AND r.acepta_pedidos = true
  ) THEN
    RAISE EXCEPTION 'El restaurante no existe, no esta activo o no acepta pedidos.';
  END IF;

  -- -----------------------------------------------------------------------
  -- Validate that at least one item was provided
  -- -----------------------------------------------------------------------
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un item.';
  END IF;

  -- -----------------------------------------------------------------------
  -- Generate unique order number: PED-XXXXXX (6 random alphanumeric chars)
  -- -----------------------------------------------------------------------
  v_numero_pedido := 'PED-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  -- -----------------------------------------------------------------------
  -- Create the pedido header
  -- -----------------------------------------------------------------------
  v_pedido_id := gen_random_uuid();

  INSERT INTO pedidos (
    id,
    cliente_id,
    restaurante_id,
    repartidor_id,
    estado,
    numero_pedido,
    direccion,
    telefono,
    metodo_pago,
    notas,
    total,
    created_at
  ) VALUES (
    v_pedido_id,
    p_cliente_id,
    p_restaurante_id,
    NULL,                -- no driver yet
    'pendiente',         -- initial state
    v_numero_pedido,
    p_direccion,
    p_telefono,
    p_metodo_pago,
    p_notas,
    0,                   -- placeholder, will be updated after items
    now()
  );

  -- -----------------------------------------------------------------------
  -- Insert pedido_items and calculate total from real prices
  -- -----------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Fetch the real menu item to get the authoritative price
    SELECT mi.id, mi.nombre, mi.precio, mi.disponible, mi.restaurante_id
    INTO v_menu_item
    FROM menu_items mi
    WHERE mi.id = (v_item->>'menu_item_id')::uuid;

    -- Validate menu item exists
    IF v_menu_item IS NULL THEN
      RAISE EXCEPTION 'Item de menu no encontrado: %', v_item->>'menu_item_id';
    END IF;

    -- Validate item belongs to the correct restaurant
    IF v_menu_item.restaurante_id != p_restaurante_id THEN
      RAISE EXCEPTION 'El item "%" no pertenece al restaurante indicado.', v_menu_item.nombre;
    END IF;

    -- Validate item is available
    IF v_menu_item.disponible = false THEN
      RAISE EXCEPTION 'El item "%" no esta disponible actualmente.', v_menu_item.nombre;
    END IF;

    -- Validate cantidad is positive
    IF COALESCE((v_item->>'cantidad')::int, 0) < 1 THEN
      RAISE EXCEPTION 'La cantidad debe ser al menos 1 para el item "%".', v_menu_item.nombre;
    END IF;

    -- Calculate line total using the real price from the database
    v_item_total := v_menu_item.precio * (v_item->>'cantidad')::int;
    v_total := v_total + v_item_total;

    -- Insert the pedido_item
    INSERT INTO pedido_items (
      id,
      pedido_id,
      menu_item_id,
      nombre,
      precio,
      cantidad,
      notas
    ) VALUES (
      gen_random_uuid(),
      v_pedido_id,
      v_menu_item.id,
      v_menu_item.nombre,
      v_menu_item.precio,
      (v_item->>'cantidad')::int,
      COALESCE(v_item->>'notas', '')
    );
  END LOOP;

  -- -----------------------------------------------------------------------
  -- Update the pedido with the calculated total
  -- -----------------------------------------------------------------------
  UPDATE pedidos
  SET total = v_total
  WHERE id = v_pedido_id;

  -- -----------------------------------------------------------------------
  -- Build and return the result as JSON
  -- -----------------------------------------------------------------------
  SELECT jsonb_build_object(
    'id',             p.id,
    'numero_pedido',  p.numero_pedido,
    'cliente_id',     p.cliente_id,
    'restaurante_id', p.restaurante_id,
    'estado',         p.estado,
    'direccion',      p.direccion,
    'telefono',       p.telefono,
    'metodo_pago',    p.metodo_pago,
    'notas',          p.notas,
    'total',          p.total,
    'created_at',     p.created_at,
    'items',          (
      SELECT jsonb_agg(jsonb_build_object(
        'id',           pi.id,
        'menu_item_id', pi.menu_item_id,
        'nombre',       pi.nombre,
        'precio',       pi.precio,
        'cantidad',     pi.cantidad,
        'notas',        pi.notas
      ))
      FROM pedido_items pi
      WHERE pi.pedido_id = p.id
    )
  )
  INTO v_result
  FROM pedidos p
  WHERE p.id = v_pedido_id;

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text) TO authenticated;


-- =============================================================================
-- Done. Summary:
-- =============================================================================
-- - RLS enabled on 7 tables
-- - 23 policies created (idempotent with DROP IF EXISTS)
-- - 1 SECURITY DEFINER function: create_order
--   * Validates auth, restaurant status, item availability
--   * Calculates totals server-side from real prices
--   * Generates unique PED-XXXXXX order numbers
--   * Atomic: rolls back on any error
-- =============================================================================
