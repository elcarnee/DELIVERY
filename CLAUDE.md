# VERO Delivery - Proyecto

## Descripción
Plataforma de delivery de comida para Comodoro Rivadavia (Zona Norte, Argentina). Conecta consumidores, comercios y repartidores en una webapp estática con Supabase como backend.

## Stack
- **Frontend**: HTML + CSS + JavaScript vanilla (sin frameworks)
- **Backend**: Supabase (Auth, PostgreSQL, Realtime channels)
- **Fuentes**: Poppins (headings), DM Sans (body)
- **Tema**: Dark mode (#0F172A base, #a3e635 lime accent)

## Estructura de Archivos
```
landing.html          → Landing page con selección de rol
auth.html             → Login/registro unificado
index.html            → App del consumidor (restaurantes, carrito, checkout)
comercios-panel.html  → Panel de gestión para comercios
repartidores-panel.html → Panel de repartidores
js/
  auth-manager.js     → Lógica de autenticación compartida
  supabase-config.js  → Config centralizada de Supabase (shared)
```

## Supabase
- **URL**: https://dsxtpgkdxkplwhrvbotg.supabase.co
- **Tablas principales**: usuarios, restaurantes, menu_items, pedidos, pedido_items, clientes, repartidores
- **Auth**: Email/password con roles (cliente, comercio, repartidor)
- **Realtime**: Channels para pedidos y restaurantes
- **RPC**: `delete_own_user` para eliminación segura de cuenta

## Flujo de Roles
- **Cliente** (consumer): Explora restaurantes → agrega al carrito → checkout → seguimiento
- **Comercio** (commerce): Recibe pedidos → acepta → prepara → marca listo + gestiona menú
- **Repartidor** (driver): Se conecta → ve pedidos listos → acepta entrega → retira → entrega

## Ciclo de Vida del Pedido
pendiente → confirmado → preparando → listo → en_camino → entregado
(también: cancelado)

## Convenciones
- Idioma de UI: Español (Argentina)
- Moneda: Pesos argentinos (formato es-AR)
- Los roles en frontend son en inglés (consumer/commerce/driver), en DB en español (cliente/comercio/repartidor)
- Session storage: sessionStorage (no localStorage) para auth de Supabase
- Carrito: localStorage (delivery_cart)

## Notas
- El polling de restaurantes (cada 3s en index.html) es redundante con realtime y debería eliminarse
- commerce_modal_component.html es un componente legacy no usado actualmente
- Los alerts/confirm nativos deberían migrarse a modales custom eventualmente
