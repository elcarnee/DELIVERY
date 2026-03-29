// ==========================================
// CONSUMER APP (index.html)
// ==========================================
// Depends on: js/supabase-config.js, js/auth-manager.js, js/vero-modal.js
// Uses singleton supabaseClient from window.supabaseClient (auto-inits via getter)

let allRestaurants = [];
let currentRestaurantId = null;
let cart = JSON.parse(localStorage.getItem('delivery_cart')) || [];

// ==========================================
// CARRITO & FLAVORS
// ==========================================
let pendingItem = null; // Store item waiting for flavor

async function addToCart(itemId, itemName, price, restaurantId, optionsStr, limit = 1) {
    // Verificar si es del mismo restaurante
    if (currentRestaurantId && currentRestaurantId !== restaurantId && cart.length > 0) {
        const ok = await veroModal.confirm('Solo puedes pedir de un restaurante a la vez. ¿Quieres vaciar el carrito y empezar un nuevo pedido de este restaurante?', { type: 'warning', title: 'Cambiar restaurante' });
        if (!ok) return;
        cart = [];
    }

    // Check for options
    if (optionsStr && optionsStr.trim() !== '') {
        openFlavorModal(itemId, itemName, price, restaurantId, optionsStr, limit);
        return;
    }

    addItemToCart(itemId, itemName, price, restaurantId);
}

function openFlavorModal(id, name, price, restaurantId, optionsStr, limit) {
    pendingItem = { id, name, price, restaurantId, limit };
    const options = optionsStr.split(',').map(s => s.trim());
    const container = document.getElementById('flavorList');
    const title = document.querySelector('#flavorModal h2');

    if (limit > 1) {
        // COUNTERS MODE
        title.innerText = `Elige hasta ${limit} opciones`;
        container.innerHTML = options.map((opt, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
                <span style="color:white; font-size:1rem;">${escapeHtml(opt)}</span>
                <div style="display:flex; gap:10px; align-items:center;">
                    <button onclick="updateFlavorCount(this, -1)" style="width:30px; height:30px; border-radius:50%; border:none; background:rgba(255,255,255,0.1); color:white; font-size:1.2rem; cursor:pointer;">-</button>
                    <span class=" flavor-count" data-flavor="${escapeAttr(opt)}">0</span>
                    <button onclick="updateFlavorCount(this, 1)" style="width:30px; height:30px; border-radius:50%; border:none; background:var(--primary); color:#0F172A; font-weight:bold; font-size:1.2rem; cursor:pointer;">+</button>
                </div>
            </div>
        `).join('');
    } else {
        // RADIO BUTTON MODE
        title.innerText = `Elige una opción`;
        container.innerHTML = options.map((opt, i) => `
            <label style="display:flex; align-items:center; gap:10px; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px; cursor:pointer;">
                <input type="radio" name="flavor" value="${escapeAttr(opt)}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--primary);">
                <span style="color:white; font-size:1rem;">${escapeHtml(opt)}</span>
            </label>
        `).join('');
    }

    document.getElementById('flavorModal').classList.add('active');
}

function updateFlavorCount(btn, delta) {
    if (!pendingItem) return;
    const countSpan = btn.parentElement.querySelector('.flavor-count');
    let current = parseInt(countSpan.innerText);

    // Check totals
    const allCounts = Array.from(document.querySelectorAll('.flavor-count'))
        .reduce((sum, el) => sum + parseInt(el.innerText), 0);

    if (delta > 0 && allCounts >= pendingItem.limit) {
        return; // Reached limit
    }
    if (delta < 0 && current === 0) return;

    countSpan.innerText = current + delta;
}

function closeFlavorModal() {
    document.getElementById('flavorModal').classList.remove('active');
    pendingItem = null;
}

async function confirmFlavor() {
    if (!pendingItem) return;
    let finalName = pendingItem.name;

    if (pendingItem.limit > 1) {
        // Gather counters
        const selected = [];
        document.querySelectorAll('.flavor-count').forEach(el => {
            const count = parseInt(el.innerText);
            if (count > 0) {
                const flavor = el.getAttribute('data-flavor');
                selected.push(`${count}x ${flavor}`);
            }
        });

        if (selected.length === 0) {
            await veroModal.alert('Debes elegir al menos una opción', { type: 'warning' });
            return;
        }
        finalName += ` (${selected.join(', ')})`;
    } else {
        // Gather Radio
        const selected = document.querySelector('input[name="flavor"]:checked');
        if (!selected) {
            await veroModal.alert('Por favor elige una opción', { type: 'warning' });
            return;
        }
        finalName += ` (${selected.value})`;
    }

    addItemToCart(pendingItem.id, finalName, pendingItem.price, pendingItem.restaurantId);
    closeFlavorModal();
}

function addItemToCart(itemId, itemName, price, restaurantId) {
    currentRestaurantId = restaurantId;

    const existingItem = cart.find(i => i.id === itemId && i.name === itemName); // Match name too (for different flavors)
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            id: itemId,
            name: itemName,
            price: price,
            quantity: 1,
            restaurantId: restaurantId
        });
    }

    saveCart();
    updateCartUI();
    showNotification(`${itemName} agregado al carrito`);
}

function removeFromCart(itemId) {
    const index = cart.findIndex(i => i.id === itemId);
    if (index > -1) {
        if (cart[index].quantity > 1) {
            cart[index].quantity--;
        } else {
            cart.splice(index, 1);
        }
    }

    if (cart.length === 0) currentRestaurantId = null;
    saveCart();
    renderCart();
    updateCartUI();
}

function saveCart() {
    localStorage.setItem('delivery_cart', JSON.stringify(cart));
    localStorage.setItem('delivery_restaurant', currentRestaurantId);
}

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Update Desktop
    const desktopBadge = document.getElementById('cartCount');
    if (desktopBadge) desktopBadge.innerText = count;

    // Update Mobile
    const mobileBadge = document.getElementById('cartCountMobile');
    if (mobileBadge) mobileBadge.innerText = count;

    // Animation
    [desktopBadge, mobileBadge].forEach(badge => {
        if (badge) {
            badge.style.transform = 'scale(1.2)';
            setTimeout(() => badge.style.transform = 'scale(1)', 200);
        }
    });
}

function toggleCart() {
    const modal = document.getElementById('cartModal');
    if (modal.classList.contains('active')) {
        modal.classList.remove('active');
    } else {
        renderCart();
        modal.classList.add('active');
    }
}

function renderCart() {
    const container = document.getElementById('cartItemsContainer');
    const totalElement = document.getElementById('cartTotal');

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🛒</div>
                <h3>Tu carrito está vacío</h3>
                <p>Agrega productos de tus restaurantes favoritos</p>
            </div>
        `;
        totalElement.innerText = '$0';
        document.getElementById('checkoutButton').style.display = 'none';
        document.getElementById('checkoutForm').style.display = 'none';
        return;
    }

    let total = 0;
    container.innerHTML = cart.map(item => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        return `
            <div class="menu-item" style="padding: 1rem;">
                <div class="menu-item-info">
                    <div class="menu-item-name">${escapeHtml(item.name)}</div>
                    <div class="menu-item-price">$${formatPrice(subtotal)}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <button onclick="removeFromCart('${escapeAttr(item.id)}')" style="background:#e2e8f0; border:none; width:30px; height:30px; border-radius:50%; font-weight:bold; cursor:pointer;">-</button>
                    <span style="font-weight:600">${item.quantity}</span>
                    <button onclick="addToCart('${escapeAttr(item.id)}', '${escapeAttr(item.name)}', ${item.price}, '${escapeAttr(item.restaurantId)}')" style="background:var(--primary); color:white; border:none; width:30px; height:30px; border-radius:50%; font-weight:bold; cursor:pointer;">+</button>
                </div>
            </div>
        `;
    }).join('');

    totalElement.innerText = '$' + formatPrice(total);
    document.getElementById('checkoutButton').style.display = 'block';
}

// ==========================================
// CHECKOUT
// ==========================================
let isCheckingOut = false;

async function proceedToCheckout() {
    const form = document.getElementById('checkoutForm');
    const btn = document.getElementById('checkoutButton');

    if (form.style.display === 'none') {
        // --- Session check BEFORE showing the checkout form ---
        try {
            const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

            if (sessionError || \!session) {
                const goToLogin = await veroModal.confirm(
                    'Debes iniciar sesión para realizar un pedido. ¿Quieres ir a la página de login?',
                    { type: 'warning', title: 'Sesión requerida' }
                );
                if (goToLogin) {
                    window.location.href = 'auth.html';
                }
                return;
            }

            // Session exists - show the checkout form
            form.style.display = 'block';
            btn.innerText = 'Confirmar Pedido';

            // Pre-fill from clientes table using session user id
            try {
                const { data: cliente, error: clienteError } = await supabaseClient
                    .from('clientes')
                    .select('nombre, telefono, direccion')
                    .eq('usuario_id', session.user.id)
                    .single();

                if (\!clienteError && cliente) {
                    if (cliente.nombre) document.getElementById('customerName').value = cliente.nombre;
                    if (cliente.telefono) document.getElementById('customerPhone').value = cliente.telefono;
                    if (cliente.direccion) document.getElementById('customerAddress').value = cliente.direccion;
                }
            } catch (prefillErr) {
                // Non-critical: if pre-fill fails, user can still type manually
                console.warn('No se pudo precargar datos del cliente:', prefillErr);
            }

        } catch (err) {
            console.error('Error verificando sesión en checkout:', err);
            await veroModal.alert(
                'Ocurrió un error al verificar tu sesión. Por favor recarga la página e intenta nuevamente.',
                { type: 'error', title: 'Error de sesión' }
            );
            return;
        }
    } else {
        submitOrder();
    }
}

async function submitOrder() {
    if (isCheckingOut) return;

    const name = document.getElementById('customerName').value;
    const phone = document.getElementById('customerPhone').value;
    const address = document.getElementById('customerAddress').value;
    const payment = document.getElementById('paymentMethod').value;
    const notes = document.getElementById('orderNotes').value;

    if (!name || !phone || !address) {
        await veroModal.alert('Por favor completa todos los campos de envío', { type: 'warning', title: 'Datos incompletos' });
        return;
    }

    isCheckingOut = true;
    const btn = document.getElementById('checkoutButton');
    const originalText = btn.innerText;
    btn.innerText = 'Enviando...';
    btn.disabled = true;

    try {
        if (!window.PROFILE_ID) {
            throw new Error("No se ha cargado el perfil del cliente. Por favor recarga la página.");
        }

        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const orderNumber = '#' + Math.floor(100000 + Math.random() * 900000);

        const restaurant = allRestaurants.find(r => r.id === currentRestaurantId);
        const costoEnvio = restaurant ? restaurant.costo_envio : 0;

        let createdOrderId = null;

        // Try RPC first (atomic server-side order creation)
        const { data: rpcData, error: rpcError } = await supabaseClient.rpc('create_order', {
            p_cliente_id: window.PROFILE_ID,
            p_restaurante_id: cart[0].restaurantId,
            p_items: cart.map(item => ({ menu_item_id: item.id, cantidad: item.quantity, notas: item.notes || '' })),
            p_direccion: address,
            p_telefono: phone,
            p_metodo_pago: payment,
            p_notas: notes || ''
        });

        if (rpcError && (rpcError.message || '').includes('function') && (rpcError.message || '').includes('does not exist') || rpcError && rpcError.code === '42883') {
            // RPC not available, fall back to direct inserts
            console.warn('create_order RPC not available, falling back to direct inserts');

            // 1. Crear Pedido
            const { data: order, error: orderError } = await supabaseClient
                .from('pedidos')
                .insert({
                    restaurante_id: currentRestaurantId,
                    cliente_id: window.PROFILE_ID,
                    numero_pedido: orderNumber,
                    cliente_nombre: name,
                    cliente_telefono: phone,
                    cliente_direccion: address,
                    metodo_pago: payment,
                    notas: notes,
                    total: total,
                    subtotal: total,
                    costo_envio: costoEnvio,
                    estado: 'pendiente'
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // 2. Crear Items
            const orderItems = cart.map(item => ({
                pedido_id: order.id,
                nombre: item.name,
                cantidad: item.quantity,
                precio_unitario: item.price,
                subtotal: item.price * item.quantity
            }));

            const { error: itemsError } = await supabaseClient
                .from('pedido_items')
                .insert(orderItems);

            if (itemsError) throw itemsError;

            createdOrderId = order.id;
        } else if (rpcError) {
            // RPC exists but returned a different error
            throw rpcError;
        } else {
            // RPC succeeded
            createdOrderId = rpcData;
        }

        // Exito
        cart = [];
        currentRestaurantId = null;
        saveCart();
        updateCartUI();
        toggleCart();

        // Abrir tracking en tiempo real
        openTracking(createdOrderId);

    } catch (error) {
        console.error('Error enviando pedido:', error);
        await veroModal.alert('Error enviando pedido: ' + (error.message || 'Intenta nuevamente'), { type: 'error', title: 'Error' });
    } finally {
        isCheckingOut = false;
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

let currentCategory = 'all';

// ==========================================
// CARGAR RESTAURANTES
// ==========================================
async function loadRestaurants() {
    const container = document.getElementById('restaurantsContainer');

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('restaurantes')
                .select('*')
                .eq('activo', true)
                .eq('acepta_pedidos', true)
                .order('calificacion', { ascending: false });

            if (error) throw error;

            // SMART UPDATE: Only re-render if data actually changed
            const currentIds = allRestaurants.map(r => r.id + r.acepta_pedidos).join(',');
            const newIds = data.map(r => r.id + r.acepta_pedidos).join(',');

            if (currentIds !== newIds) {
                allRestaurants = data;
                renderRestaurants(allRestaurants);
            }

        } catch (error) {
            console.error('Error cargando restaurantes:', error);
            // Only show error if we have no data at all
            if (allRestaurants.length === 0) showError(container);
        }
    } else {
        renderRestaurants(allRestaurants);
    }
}

// ==========================================
// RENDERIZAR RESTAURANTES
// ==========================================
function renderRestaurants(restaurants) {
    const container = document.getElementById('restaurantsContainer');

    if (restaurants.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">😔</div>
                <h3>No encontramos restaurantes</h3>
                <p>Intenta con otra búsqueda o categoría</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="restaurants-grid">
            ${restaurants.map((r, i) => `
                <div class="restaurant-card" style="--delay: ${i * 0.05}s" onclick="openRestaurant('${escapeAttr(r.id)}')">
                    <div class="restaurant-image-wrapper">
                        <img src="${r.imagen_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400'}"
                             alt="${escapeAttr(r.nombre)}"
                             class="restaurant-image"
                             loading="lazy">
                        <div class="restaurant-badges">
                            ${r.calificacion >= 4.7 ? '<span class="badge badge-popular">Popular</span>' : ''}
                            ${isNew(r.created_at) ? '<span class="badge badge-new">Nuevo</span>' : ''}
                        </div>
                        <div class="restaurant-rating">
                            ⭐ ${r.calificacion.toFixed(1)}
                        </div>
                    </div>
                    <div class="restaurant-info">
                        <h3 class="restaurant-name">${escapeHtml(r.nombre)}</h3>
                        <p class="restaurant-category">${escapeHtml(r.descripcion || r.categoria)}</p>
                        <div class="restaurant-meta">
                            <span class="meta-item">
                                🕒 ${escapeHtml(r.horarios || 'Consultar')}
                            </span>
                            <span class="meta-item">
                                🕐 ${r.tiempo_preparacion} min
                            </span>
                            <span class="meta-item">
                                🛵 $${r.costo_envio}
                            </span>
                            <span class="meta-item">
                                📍 <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.direccion || r.zona)}" target="_blank" style="color:inherit; text-decoration:none; hover:underline;">
                                    ${escapeHtml(r.direccion || r.zona)}
                                </a>
                            </span>
                        </div>
                        <div style="font-size:0.7rem; color:#ccc; margin-top:0.5rem;">ID: ${escapeHtml(r.id.slice(0, 8))}...</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ==========================================
// ABRIR RESTAURANTE
// ==========================================
async function openRestaurant(id) {
    const modal = document.getElementById('restaurantModal');
    const content = document.getElementById('modalContent');

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        // Obtener restaurante
        const { data: restaurant, error: restError } = await supabaseClient
            .from('restaurantes')
            .select('*')
            .eq('id', id)
            .single();

        if (restError) throw restError;

        // Obtener menu
        const { data: menuItems, error: menuError } = await supabaseClient
            .from('menu_items')
            .select('*')
            .eq('restaurante_id', id)
            .eq('disponible', true)
            .order('categoria', { ascending: true });

        if (menuError) throw menuError;

        // Agrupar por categoria
        const menuByCategory = menuItems.reduce((acc, item) => {
            if (!acc[item.categoria]) acc[item.categoria] = [];
            acc[item.categoria].push(item);
            return acc;
        }, {});

        content.innerHTML = `
            <div style="margin-bottom: 2rem;">
                <h1 style="font-family: 'Poppins', sans-serif; font-size: 2.5rem; font-weight: 700; margin-bottom: 0.75rem;">
                    ${escapeHtml(restaurant.nombre)}
                </h1>
                <p style="color: var(--gray); font-size: 1.125rem; margin-bottom: 1rem;">
                    ${escapeHtml(restaurant.descripcion)}
                </p>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; color: var(--gray);">
                    <span style="display: flex; align-items: center; gap: 0.5rem;">
                        ⭐ ${restaurant.calificacion.toFixed(1)} (${restaurant.total_calificaciones} reseñas)
                    </span>
                    <span>🕐 ${restaurant.tiempo_preparacion} min</span>
                    <span>🛵 $${restaurant.costo_envio}</span>
                    <span>
                        📍 <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.direccion || restaurant.zona)}" target="_blank" style="color:var(--primary); text-decoration:none;">
                            ${escapeHtml(restaurant.direccion || restaurant.zona)}
                        </a>
                    </span>
                </div>
            </div>

            ${Object.keys(menuByCategory).length === 0 ? `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <h3>Sin menú disponible</h3>
                    <p>Este restaurante aún no ha cargado su menú</p>
                </div>
            ` : Object.keys(menuByCategory).map(category => `
                <div class="menu-section">
                    <h3 class="menu-section-title">${escapeHtml(category)}</h3>
                    ${menuByCategory[category].map(item => `
                        <div class="menu-item" style="display: flex; gap: 1rem; align-items: center;">
                            ${item.imagen_url ? `
                                <img src="${item.imagen_url}" alt="${escapeAttr(item.nombre)}"
                                     style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;"
                                     loading="lazy">
                            ` : ''}
                            <div class="menu-item-info" style="flex: 1;">
                                <div class="menu-item-name">${escapeHtml(item.nombre)}</div>
                                <div class="menu-item-description">${escapeHtml(item.descripcion || '')}</div>
                                <div class="menu-item-price">$${formatPrice(item.precio)}</div>
                            </div>
                            <button class="add-button" data-action="add-to-cart" data-item-id="${escapeAttr(item.id)}" data-item-name="${escapeAttr(item.nombre)}" data-item-price="${item.precio}" data-item-restaurant-id="${escapeAttr(restaurant.id)}" data-item-restaurant-name="${escapeAttr(restaurant.nombre)}" data-item-options="${escapeAttr(item.opciones || '')}" data-item-limit="${item.limite_opciones || 1}">
                                Agregar
                            </button>
                        </div>
                    `).join('')}
                </div>
            `).join('')}
        `;

        // Event delegation for add-to-cart buttons
        content.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-action="add-to-cart"]');
            if (!btn) return;
            const itemId = btn.getAttribute('data-item-id');
            const itemName = btn.getAttribute('data-item-name');
            const itemPrice = parseFloat(btn.getAttribute('data-item-price'));
            const restaurantId = btn.getAttribute('data-item-restaurant-id');
            const optionsStr = btn.getAttribute('data-item-options');
            const limit = parseInt(btn.getAttribute('data-item-limit')) || 1;
            addToCart(itemId, itemName, itemPrice, restaurantId, optionsStr, limit);
        });
    } catch (error) {
        console.error('Error cargando restaurante:', error);
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">❌</div>
                <h3>Error al cargar</h3>
                <p>Intenta nuevamente más tarde</p>
            </div>
        `;
    }
}

function subscribeToRestaurants() {
    if (!supabaseClient) return;

    supabaseClient
        .channel('public:restaurantes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurantes' }, payload => {
            // Reload list on any change
            loadRestaurants();
        })
        .subscribe();
}

// ==========================================
// TRACKING EN TIEMPO REAL
// ==========================================
let trackingChannel = null;
let trackingOrderId = null;
let trackingTimer = null;
let myOrdersChannel = null;

const TRACKING_STEPS = [
    { key: 'pendiente',  label: 'Pedido enviado',      icon: '\uD83D\uDCDD' },
    { key: 'confirmado', label: 'Confirmado',           icon: '\u2705' },
    { key: 'preparando', label: 'En preparación',       icon: '\uD83D\uDC68\u200D\uD83C\uDF73' },
    { key: 'listo',      label: 'Listo para retirar',   icon: '\uD83D\uDCE6' },
    { key: 'en_camino',  label: 'En camino',            icon: '\uD83D\uDEF5' },
    { key: 'entregado',  label: 'Entregado',            icon: '\uD83C\uDF89' }
];

async function openTracking(orderId) {
    trackingOrderId = orderId;
    const modal = document.getElementById('trackingModal');
    const content = document.getElementById('trackingContent');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const { data: order, error } = await supabaseClient
            .from('pedidos')
            .select('*, restaurantes(nombre, direccion, telefono), repartidores(nombre, telefono)')
            .eq('id', orderId)
            .single();

        if (error) throw error;

        renderTracking(order);
        subscribeToOrderTracking(orderId);

        // Start elapsed timer (legitimate 10s interval for UI update)
        if (trackingTimer) clearInterval(trackingTimer);
        trackingTimer = setInterval(() => {
            const el = document.getElementById('trackingElapsed');
            if (el && order.created_at) {
                const mins = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
                el.textContent = mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}min`;
            }
        }, 10000);

    } catch (error) {
        console.error('Error loading tracking:', error);
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">\u26A0\uFE0F</div>
                <h3>No se pudo cargar</h3>
                <p>Intenta nuevamente</p>
            </div>
        `;
    }
}

function renderTracking(order) {
    const content = document.getElementById('trackingContent');
    const stepIndex = TRACKING_STEPS.findIndex(s => s.key === order.estado);
    const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
    const elapsedStr = elapsed < 60 ? `${elapsed} min` : `${Math.floor(elapsed/60)}h ${elapsed%60}min`;

    content.innerHTML = `
        <div class="tracking-meta">
            <div class="tracking-meta-row">
                <span class="tracking-meta-label">Restaurante</span>
                <span class="tracking-meta-value">${escapeHtml(order.restaurantes?.nombre || 'Restaurante')}</span>
            </div>
            ${order.repartidores ? `
            <div class="tracking-meta-row">
                <span class="tracking-meta-label">Repartidor</span>
                <span class="tracking-meta-value">${escapeHtml(order.repartidores.nombre)}</span>
            </div>
            ` : ''}
            <div class="tracking-meta-row">
                <span class="tracking-meta-label">Total</span>
                <span class="tracking-meta-value" style="color: var(--primary);">$${formatPrice(order.total)}</span>
            </div>
            <div class="tracking-meta-row">
                <span class="tracking-meta-label">Método de pago</span>
                <span class="tracking-meta-value">${escapeHtml(order.metodo_pago || 'Efectivo')}</span>
            </div>
            <div class="tracking-meta-row">
                <span class="tracking-meta-label">Tiempo transcurrido</span>
                <span class="tracking-meta-value" id="trackingElapsed">${elapsedStr}</span>
            </div>
        </div>

        <div class="tracking-stepper">
            ${TRACKING_STEPS.map((step, i) => {
                let cls = 'pending';
                if (i < stepIndex) cls = 'completed';
                else if (i === stepIndex) cls = 'active';
                return `
                    <div class="tracking-step ${cls}">
                        <div class="step-icon">${step.icon}</div>
                        <div class="step-info">
                            <div class="step-label">${step.label}</div>
                            ${cls === 'active' ? '<div class="step-time">Ahora</div>' : ''}
                            ${cls === 'completed' ? '<div class="step-time">Completado</div>' : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        ${order.estado === 'entregado' ? `
            <div style="text-align:center; padding:1rem; display:flex; flex-direction:column; gap:0.75rem;">
                <button onclick="closeTracking(); rateOrder('${escapeAttr(order.id)}', 'restaurant')" class="add-button" style="padding:1rem 2rem; width:100%;">
                    \u2B50 Calificar Restaurante
                </button>
                ${order.repartidor_id ? `
                <button onclick="closeTracking(); rateOrder('${escapeAttr(order.id)}', 'driver')" style="padding:1rem 2rem; width:100%; background:rgba(255,255,255,0.1); color:white; border:none; border-radius:50px; font-weight:700; cursor:pointer;">
                    \uD83D\uDEF5 Calificar Repartidor
                </button>
                ` : ''}
                <button onclick="closeTracking()" style="padding:0.75rem; background:none; border:none; color:var(--gray); cursor:pointer; font-weight:600;">
                    Cerrar
                </button>
            </div>
        ` : ''}
    `;
}

function subscribeToOrderTracking(orderId) {
    if (trackingChannel) {
        supabaseClient.removeChannel(trackingChannel);
    }

    trackingChannel = supabaseClient
        .channel('tracking-' + orderId)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'pedidos',
            filter: 'id=eq.' + orderId
        }, async (payload) => {
            // Re-fetch full order with joins
            const { data: order } = await supabaseClient
                .from('pedidos')
                .select('*, restaurantes(nombre, direccion, telefono), repartidores(nombre, telefono)')
                .eq('id', orderId)
                .single();

            if (order) {
                renderTracking(order);
                playNotificationSound();
            }
        })
        .subscribe();
}

function closeTracking() {
    const modal = document.getElementById('trackingModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    trackingOrderId = null;

    if (trackingChannel) {
        supabaseClient.removeChannel(trackingChannel);
        trackingChannel = null;
    }
    if (trackingTimer) {
        clearInterval(trackingTimer);
        trackingTimer = null;
    }
}

function subscribeToMyOrders() {
    if (!supabaseClient || !window.PROFILE_ID) return;

    myOrdersChannel = supabaseClient
        .channel('my-orders-' + window.PROFILE_ID)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'pedidos',
            filter: 'cliente_id=eq.' + window.PROFILE_ID
        }, (payload) => {
            const newState = payload.new.estado;
            const statusLabels = {
                confirmado: 'Tu pedido fue confirmado',
                preparando: 'Tu pedido se está preparando',
                listo: 'Tu pedido está listo para retirar',
                en_camino: 'Tu pedido está en camino',
                entregado: '¡Tu pedido fue entregado!'
            };

            if (statusLabels[newState] && !trackingOrderId) {
                veroModal.toast(statusLabels[newState], {
                    type: newState === 'entregado' ? 'success' : 'info'
                });
                playNotificationSound();
            }
        })
        .subscribe();
}

// ==========================================
// FILTROS
// ==========================================
function filterCategory(category, element) {
    currentCategory = category;

    // Update active state
    document.querySelectorAll('.category-pill').forEach(pill => {
        pill.classList.remove('active');
    });
    element.classList.add('active');

    filterRestaurants();
}

function filterRestaurants() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    let filtered = allRestaurants.filter(r => {
        const matchesSearch = r.nombre.toLowerCase().includes(searchTerm) ||
            r.descripcion?.toLowerCase().includes(searchTerm) ||
            r.categoria.toLowerCase().includes(searchTerm);

        const matchesCategory = currentCategory === 'all' ||
            r.categoria === currentCategory;

        return matchesSearch && matchesCategory;
    });

    renderRestaurants(filtered);
}

// ==========================================
// UTILIDADES
// ==========================================
function closeModal() {
    document.getElementById('restaurantModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

// formatPrice now comes from js/supabase-config.js

function isNew(createdAt) {
    const created = new Date(createdAt);
    const now = new Date();
    const diffDays = (now - created) / (1000 * 60 * 60 * 24);
    return diffDays < 30;
}

function showNotification(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.transform = 'translateY(0)';
    setTimeout(() => { toast.style.transform = 'translateY(100px)'; }, 2500);
}

function showError(container) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <h3>Error de conexión</h3>
            <p>Verifica tu conexión a Supabase</p>
        </div>
        `;
}

// ==========================================
// PROFILE LOGIC
// ==========================================

function openProfileModal() {
    document.getElementById('profileModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    if (window.PROFILE_ID) loadHistory(); // Use PROFILE_ID for history
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function switchProfileTab(tab) {
    const btnData = document.querySelectorAll('.profile-tab')[0];
    const btnHistory = document.querySelectorAll('.profile-tab')[1];
    const tabData = document.getElementById('tab-data');
    const tabHistory = document.getElementById('tab-history');

    if (tab === 'data') {
        btnData.classList.add('active'); btnData.style.borderBottom = '2px solid var(--primary)'; btnData.style.color = 'white';
        btnHistory.classList.remove('active'); btnHistory.style.borderBottom = 'none'; btnHistory.style.color = 'var(--gray)';
        tabData.style.display = 'block';
        tabHistory.style.display = 'none';
    } else {
        btnHistory.classList.add('active'); btnHistory.style.borderBottom = '2px solid var(--primary)'; btnHistory.style.color = 'white';
        btnData.classList.remove('active'); btnData.style.borderBottom = 'none'; btnData.style.color = 'var(--gray)';
        tabData.style.display = 'none';
        tabHistory.style.display = 'block';
        if (window.PROFILE_ID) loadHistory();
    }
}

async function saveProfile() {
    const name = document.getElementById('profileName').value;
    const phone = document.getElementById('profilePhone').value;
    const address = document.getElementById('profileAddress').value;

    if (!window.USER_ID) {
        await veroModal.alert('No hay sesión activa', { type: 'error' });
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('clientes')
            .update({
                nombre: name,
                telefono: phone,
                direccion: address
            })
            .eq('usuario_id', window.USER_ID);

        if (error) throw error;
        await veroModal.alert('Datos guardados correctamente', { type: 'success', title: 'Perfil actualizado' });
    } catch (error) {
        console.error(error);
        await veroModal.alert('Error guardando datos', { type: 'error' });
    }
}

async function loadHistory() {
    const container = document.getElementById('historyList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const { data: orders, error } = await supabaseClient
            .from('pedidos')
            .select('*, restaurantes(nombre)')
            .eq('cliente_id', window.PROFILE_ID) // Use Client Profile ID
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (orders.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No has hecho pedidos aún</p></div>';
            return;
        }

        const activeStates = ['pendiente', 'confirmado', 'preparando', 'listo', 'en_camino'];
        container.innerHTML = orders.map(o => {
            const isActive = activeStates.includes(o.estado);
            return `
            <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); ${isActive ? 'cursor:pointer;' : ''}" ${isActive ? `onclick="closeProfileModal(); openTracking('${escapeAttr(o.id)}')"` : ''}>
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                    <span style="font-weight:bold; color:white;">${escapeHtml(o.restaurantes?.nombre || 'Restaurante')}</span>
                    <span style="color:var(--gray); font-size:0.9rem;">${new Date(o.created_at).toLocaleDateString()}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="badge" style="background:${getStatusColor(o.estado)}; color:white; padding:0.25rem 0.75rem; border-radius:99px; font-size:0.8rem;">
                        ${o.estado.toUpperCase()}
                    </span>
                    <span style="font-weight:bold; color:var(--primary);">$${formatPrice(o.total)}</span>
                </div>
                ${isActive ? `
                    <div style="margin-top:0.75rem; color:var(--primary); font-size:0.85rem; font-weight:600;">
                        Toca para ver seguimiento en vivo
                    </div>
                ` : ''}
                ${o.estado === 'entregado' ? `
                    <div style="margin-top:1rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.1); display:flex; gap:1rem;">
                        <button onclick="event.stopPropagation(); rateOrder('${escapeAttr(o.id)}', 'restaurant')" style="flex:1; padding:0.5rem; background:rgba(255,255,255,0.1); color:white; border:none; border-radius:6px; cursor:pointer;">⭐ Calificar Local</button>
                        <button onclick="event.stopPropagation(); rateOrder('${escapeAttr(o.id)}', 'driver')" style="flex:1; padding:0.5rem; background:rgba(255,255,255,0.1); color:white; border:none; border-radius:6px; cursor:pointer;">🛵 Calificar Repartidor</button>
                    </div>
                ` : ''}
            </div>
        `}).join('');

    } catch (error) {
        console.error(error);
        container.innerHTML = '<p style="color:red">Error cargando historial</p>';
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'pendiente': return 'var(--accent)';
        case 'confirmado': return '#06b6d4';
        case 'preparando': return '#3b82f6';
        case 'listo': return '#8b5cf6';
        case 'en_camino': return '#a855f7';
        case 'entregado': return 'var(--success)';
        case 'cancelado': return 'var(--danger)';
        default: return 'var(--gray)';
    }
}

// ==========================================
// RATING SYSTEM
// ==========================================
let ratingState = { orderId: null, type: null, value: 0 };

async function rateOrder(orderId, type) {
    // Check if already rated
    const { data: existing } = await supabaseClient
        .from('calificaciones')
        .select('id, rating_restaurante, rating_repartidor')
        .eq('pedido_id', orderId)
        .maybeSingle();

    if (existing) {
        const field = type === 'restaurant' ? 'rating_restaurante' : 'rating_repartidor';
        if (existing[field]) {
            await veroModal.alert('Ya calificaste este pedido.', { type: 'info' });
            return;
        }
    }

    ratingState = { orderId, type, value: 0, existingId: existing?.id || null };
    const label = type === 'restaurant' ? 'el restaurante' : 'al repartidor';

    const modal = document.getElementById('ratingModal');
    document.getElementById('ratingTitle').textContent = `Calificar ${label}`;
    document.getElementById('ratingComment').value = '';
    renderStars(0);
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function renderStars(selected) {
    const container = document.getElementById('ratingStars');
    container.innerHTML = [1, 2, 3, 4, 5].map(i => `
        <button type="button" onclick="selectStar(${i})" style="background:none; border:none; font-size:2.5rem; cursor:pointer; transition:transform 0.2s; padding:0.25rem; ${i <= selected ? '' : 'opacity:0.3;'}"
            aria-label="${i} estrella${i > 1 ? 's' : ''}">
            ${i <= selected ? '\u2B50' : '\u2606'}
        </button>
    `).join('');
    ratingState.value = selected;
}

function selectStar(n) {
    renderStars(n);
}

function closeRatingModal() {
    document.getElementById('ratingModal').classList.remove('active');
    document.body.style.overflow = 'auto';
    ratingState = { orderId: null, type: null, value: 0 };
}

async function submitRating() {
    if (ratingState.value === 0) {
        await veroModal.alert('Selecciona al menos 1 estrella', { type: 'warning' });
        return;
    }

    const btn = document.getElementById('btnSubmitRating');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    const field = ratingState.type === 'restaurant' ? 'rating_restaurante' : 'rating_repartidor';
    const comment = document.getElementById('ratingComment').value.trim();

    try {
        // Get order details for restaurant/driver IDs
        const { data: order } = await supabaseClient
            .from('pedidos')
            .select('restaurante_id, repartidor_id')
            .eq('id', ratingState.orderId)
            .single();

        if (!order) throw new Error('Pedido no encontrado');

        if (ratingState.existingId) {
            // Update existing rating row
            const update = { [field]: ratingState.value };
            if (comment) update.comentario = comment;

            const { error } = await supabaseClient
                .from('calificaciones')
                .update(update)
                .eq('id', ratingState.existingId);
            if (error) throw error;
        } else {
            // Insert new rating
            const { error } = await supabaseClient
                .from('calificaciones')
                .insert({
                    pedido_id: ratingState.orderId,
                    cliente_id: window.PROFILE_ID,
                    restaurante_id: order.restaurante_id,
                    repartidor_id: order.repartidor_id,
                    [field]: ratingState.value,
                    comentario: comment || null
                });
            if (error) throw error;
        }

        closeRatingModal();
        await veroModal.alert(`Gracias por tu calificacion de ${ratingState.value} estrellas!`, { type: 'success', title: 'Calificacion enviada' });

    } catch (error) {
        console.error('Error submitting rating:', error);
        await veroModal.alert('Error enviando calificacion: ' + error.message, { type: 'error' });
    } finally {
        btn.disabled = false;
        btn.textContent = 'Enviar Calificacion';
    }
}

// ==========================================
// BOTTOM NAV
// ==========================================
function switchNav(tab) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
    if (tab === 'home') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ==========================================
// INIT
// ==========================================
function initConsumer() {
    checkSession(null, async (session, userData) => {
        if (session) {
            // Show profile button, hide login button
            document.querySelector('#authButtons button').style.display = 'none';
            document.getElementById('profileBtn').style.display = 'block';
            window.USER_ID = session.user.id;

            // 1. Try to fetch existing profile (Robust against duplicates)
            let { data: clients, error } = await supabaseClient
                .from('clientes')
                .select('*')
                .eq('usuario_id', session.user.id)
                .limit(1); // Take only the first one if duplicates exist

            if (error) console.error("Error buscando perfil:", error);

            let client = clients && clients.length > 0 ? clients[0] : null;

            // 2. If not found, create it (upsert)
            if (!client) {
                const { data: user } = await supabaseClient.from('usuarios').select('nombre').eq('id', session.user.id).single();

                const { data: newClient, error: createError } = await supabaseClient
                    .from('clientes')
                    .upsert({
                        id: session.user.id, // FORCE ID sync
                        usuario_id: session.user.id,
                        nombre: user ? user.nombre : 'Usuario'
                        // REMOVED telefono and direccion to prevent overwriting existing data
                    }, { onConflict: 'id' }) // Prevent duplicates
                    .select()
                    .single();

                if (createError) console.error("Error creando perfil:", createError);
                client = newClient;
            }

            if (client) {
                window.PROFILE_ID = client.id;
                document.getElementById('profileName').value = client.nombre || '';
                document.getElementById('profilePhone').value = client.telefono || '';
                document.getElementById('profileAddress').value = client.direccion || '';
                subscribeToMyOrders();
            }
        }
    });

    subscribeToRestaurants();
    loadRestaurants();

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (overlay.id === 'trackingModal') {
                    closeTracking();
                    return;
                }
                overlay.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        });
    });
}

window.addEventListener('DOMContentLoaded', initConsumer);
