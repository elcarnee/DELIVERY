-- =============================================================================
-- VERO Delivery - Sprint 3: Ratings Table
-- =============================================================================
-- Creates calificaciones table for restaurant and driver ratings.
-- Safe to re-run: uses IF NOT EXISTS and DROP POLICY IF EXISTS.
-- =============================================================================

-- Create ratings table
CREATE TABLE IF NOT EXISTS calificaciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL,
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE SET NULL,
    repartidor_id UUID REFERENCES repartidores(id) ON DELETE SET NULL,
    rating_restaurante SMALLINT CHECK (rating_restaurante >= 1 AND rating_restaurante <= 5),
    rating_repartidor SMALLINT CHECK (rating_repartidor >= 1 AND rating_repartidor <= 5),
    comentario TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate ratings per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_calificaciones_pedido
    ON calificaciones(pedido_id);

-- Index for restaurant average lookups
CREATE INDEX IF NOT EXISTS idx_calificaciones_restaurante
    ON calificaciones(restaurante_id) WHERE rating_restaurante IS NOT NULL;

-- Index for driver average lookups
CREATE INDEX IF NOT EXISTS idx_calificaciones_repartidor
    ON calificaciones(repartidor_id) WHERE rating_repartidor IS NOT NULL;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE calificaciones ENABLE ROW LEVEL SECURITY;

-- Clients can insert their own ratings
DROP POLICY IF EXISTS "clients_insert_own_ratings" ON calificaciones;
CREATE POLICY "clients_insert_own_ratings" ON calificaciones
    FOR INSERT TO authenticated
    WITH CHECK (
        cliente_id IN (
            SELECT id FROM clientes WHERE usuario_id = auth.uid()
        )
    );

-- Clients can read their own ratings
DROP POLICY IF EXISTS "clients_read_own_ratings" ON calificaciones;
CREATE POLICY "clients_read_own_ratings" ON calificaciones
    FOR SELECT TO authenticated
    USING (
        cliente_id IN (
            SELECT id FROM clientes WHERE usuario_id = auth.uid()
        )
    );

-- Commerce can read ratings for their restaurant
DROP POLICY IF EXISTS "commerce_read_restaurant_ratings" ON calificaciones;
CREATE POLICY "commerce_read_restaurant_ratings" ON calificaciones
    FOR SELECT TO authenticated
    USING (
        restaurante_id IN (
            SELECT id FROM restaurantes WHERE usuario_id = auth.uid()
        )
    );

-- Drivers can read their own ratings
DROP POLICY IF EXISTS "drivers_read_own_ratings" ON calificaciones;
CREATE POLICY "drivers_read_own_ratings" ON calificaciones
    FOR SELECT TO authenticated
    USING (
        repartidor_id IN (
            SELECT id FROM repartidores WHERE usuario_id = auth.uid()
        )
    );
