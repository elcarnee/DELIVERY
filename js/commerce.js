// ==========================================
// COMMERCE PANEL
// ==========================================
// Depends on: js/supabase-config.js, js/auth-manager.js (must be loaded first)
// Uses singleton supabaseClient from window.supabaseClient

let RESTAURANTE_ID = null;
let allOrders = [];
let currentFilter = 'pending';
const menuItemsMap = new Map();

// ==========================================
// INITIALIZATION
// ==========================================

function initCommerce() {
    checkSession('comercio', async (session, user) => {
        // Fetch linked restaurant
        const { data: restaurant, error: restError } = await supabaseClient
            .from('restaurantes')
            .select('id, nombre')
            .eq('usuario_id', session.user.id)
            .single();

        if (restError || !restaurant) {
            console.error('Restaurant fetch error:', restError);
            document.getElementById('ordersContainer').innerHTML = `
                <div class="empty-state">
                    <h3>Bienvenido</h3>
                    <p>Tu usuario no tiene un restaurante asignado todavia.</p>
                    <p>Por favor contacta a soporte para vincular tu local.</p>
                </div>
            `;
            return;
        }

        // Success: Set Global ID and Load Orders
        RESTAURANTE_ID = restaurant.id;
        window.CURRENT_RESTAURANT_NAME = restaurant.nombre;

        // Sync store status on load
        try {
            const { data, error } = await supabaseClient
                .from('restaurantes')
                .select('acepta_pedidos, horarios')
                .eq('id', RESTAURANTE_ID)
                .single();

            if (!error && data) {
                const toggle = document.getElementById('storeToggle');
                if (toggle) toggle.checked = data.acepta_pedidos;
                updateStatusLabel(data.acepta_pedidos);

                if (data.horarios) {
                    startAutoCloseCheck(data.horarios);
                }
            }
        } catch (err) {
            console.error('Error syncing status:', err);
        }

        loadOrders();
        subscribeToChanges();
    });
}

document.addEventListener('DOMContentLoaded', initCommerce);

// ==========================================
// ORDERS
// ==========================================

async function loadOrders() {
    if (!RESTAURANTE_ID) return;

    try {
        const { data, error } = await supabaseClient
            .from('pedidos')
            .select(`
                id,
                estado,
                total,
                created_at,
                numero_pedido,
                cliente_nombre,
                cliente_telefono,
                cliente_direccion,
                metodo_pago,
                pedido_items (
                    cantidad,
                    notas,
                    nombre,
                    subtotal
                )
            `)
            .eq('restaurante_id', RESTAURANTE_ID)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allOrders = data;
        renderOrders();
        updateStats();

    } catch (error) {
        console.error('Error loading orders:', error);
        const container = document.getElementById('ordersContainer');
        container.innerHTML = `
            <div class="empty-state" style="color:red; text-align:left; padding:2rem;">
                <h3>Error cargando pedidos</h3>
                <p><strong>Mensaje:</strong> ${escapeHtml(error.message)}</p>
                <p><strong>Detalle:</strong> ${escapeHtml(JSON.stringify(error))}</p>
                <p>Codigo: ${error.code || 'N/A'}</p>
            </div>
        `;
    }
}

function showError(error) {
    document.getElementById('ordersContainer').innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">&#9888;</div>
            <h3>Error de conexion</h3>
            <p>${error ? escapeHtml(error.message) : 'Verifica la configuracion de Supabase'}</p>
            <p style="font-size:0.8rem; color:red;">${error ? escapeHtml(JSON.stringify(error)) : ''}</p>
        </div>
    `;
}

// ==========================================
// REALTIME
// ==========================================

function subscribeToChanges() {
    supabaseClient
        .channel('pedidos-changes')
        .on('postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'pedidos',
                filter: `restaurante_id=eq.${RESTAURANTE_ID}`
            },
            (payload) => {
                loadOrders();
                playNotificationSound();
            }
        )
        .subscribe();
}

// ==========================================
// RENDER ORDERS
// ==========================================

function renderOrders() {
    const container = document.getElementById('ordersContainer');

    let filtered = allOrders;
    if (currentFilter !== 'all') {
        filtered = allOrders.filter(o => {
            if (currentFilter === 'pending') return o.estado === 'pendiente' || o.estado === 'confirmado';
            if (currentFilter === 'preparing') return o.estado === 'preparando';
            if (currentFilter === 'ready') return o.estado === 'listo';
            return true;
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">&#128237;</div>
                <h3>No hay pedidos ${currentFilter !== 'all' ? 'en este estado' : ''}</h3>
                <p>Los nuevos pedidos apareceran aqui automaticamente</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="orders-grid">
            ${filtered.map(order => renderOrderCard(order)).join('')}
        </div>
    `;
}

function renderOrderCard(order) {
    const statusClass = order.estado === 'pendiente' || order.estado === 'confirmado' ? 'pending' :
        order.estado === 'preparando' ? 'preparing' : 'ready';

    const statusBadgeClass = order.estado === 'pendiente' || order.estado === 'confirmado' ? 'status-pending' :
        order.estado === 'preparando' ? 'status-preparing' : 'status-ready';

    const statusText = order.estado === 'pendiente' ? '&#9203; Nuevo' :
        order.estado === 'confirmado' ? '&#10003; Confirmado' :
            order.estado === 'preparando' ? '&#128104;&#8205;&#127859; Preparando' :
                order.estado === 'listo' ? '&#9989; Listo' : order.estado;

    const timeAgo = getTimeAgo(order.created_at);

    return `
        <div class="order-card ${statusClass}">
            <div class="order-header">
                <div>
                    <div class="order-number">${escapeHtml(order.numero_pedido)}</div>
                    <div class="order-time">Hace ${timeAgo}</div>
                </div>
                <span class="status-badge ${statusBadgeClass}">${statusText}</span>
            </div>

            <div class="order-items">
                ${(order.pedido_items || []).map(item => `
                    <div class="order-item">
                        <div>
                            <span class="item-quantity">${item.cantidad}x</span>
                            <span class="item-name">${escapeHtml(item.nombre)}</span>
                        </div>
                        <span>$${formatPrice(item.subtotal)}</span>
                    </div>
                `).join('')}
            </div>

            <div class="customer-info">
                <div class="info-item">
                    <div>
                        <div class="info-label">Cliente</div>
                        <div>${escapeHtml(order.cliente_nombre) || 'Cliente'}</div>
                    </div>
                </div>
                <div class="info-item">
                    <div>
                        <div class="info-label">Telefono</div>
                        <div>${escapeHtml(order.cliente_telefono) || ''}</div>
                    </div>
                </div>
                <div class="info-item">
                    <div>
                        <div class="info-label">Direccion</div>
                        <div>${escapeHtml(order.cliente_direccion) || 'Retiro en local'}</div>
                    </div>
                </div>
                <div class="info-item">
                    <div>
                        <div class="info-label">Pago</div>
                        <div>${escapeHtml(order.metodo_pago) || 'Efectivo'}</div>
                    </div>
                </div>
            </div>

            ${order.notas ? `<div style="margin: 1rem 0; padding: 1rem; background: #FEF3C7; border-radius: 12px;">
                <strong>Nota:</strong> ${escapeHtml(order.notas)}
            </div>` : ''}

            <div class="order-total">
                <span class="total-label">Total:</span>
                <span class="total-amount">$${formatPrice(order.total)}</span>
            </div>

            <div class="action-buttons">
                ${order.estado === 'pendiente' ? `
                    <button class="btn btn-accept" onclick="acceptOrder('${order.id}')">
                        &#10003; Aceptar Pedido
                    </button>
                    <button class="btn btn-reject" onclick="rejectOrder('${order.id}')">
                        &#10005; Rechazar
                    </button>
                ` : order.estado === 'confirmado' ? `
                    <button class="btn btn-accept" onclick="startPreparing('${order.id}')">
                        &#128104;&#8205;&#127859; Comenzar a Preparar
                    </button>
                ` : order.estado === 'preparando' ? `
                    <button class="btn btn-ready" onclick="markReady('${order.id}')">
                        &#10003; Marcar como Listo
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// ==========================================
// ORDER ACTIONS
// ==========================================

async function acceptOrder(orderId) {
    if (!await veroModal.confirm('Aceptar este pedido?', { type: 'info', title: 'Aceptar pedido', confirmText: 'Aceptar' })) return;
    await updateOrderStatus(orderId, 'confirmado');
}

async function startPreparing(orderId) {
    await updateOrderStatus(orderId, 'preparando');
}

async function markReady(orderId) {
    await updateOrderStatus(orderId, 'listo');
}

async function rejectOrder(orderId) {
    if (!await veroModal.confirm('Rechazar este pedido? Esta accion no se puede deshacer.', { type: 'error', title: 'Rechazar pedido', confirmText: 'Rechazar' })) return;
    await updateOrderStatus(orderId, 'cancelado');
}

async function updateOrderStatus(orderId, newStatus) {
    const { error } = await supabaseClient
        .from('pedidos')
        .update({ estado: newStatus })
        .eq('id', orderId)
        .eq('restaurante_id', RESTAURANTE_ID);

    if (error) {
        veroModal.alert('Error actualizando pedido', { type: 'error' });
        console.error(error);
    } else {
        loadOrders();
    }
}

// ==========================================
// FILTER & STATS
// ==========================================

function filterOrders(filter) {
    currentFilter = filter;
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    renderOrders();
}

function updateStats() {
    const pending = allOrders.filter(o => o.estado === 'pendiente' || o.estado === 'confirmado').length;
    const today = allOrders.filter(o => isToday(o.created_at)).length;
    const total = allOrders.filter(o => isToday(o.created_at)).reduce((sum, o) => sum + o.total, 0);

    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('todayCount').textContent = today;
    document.getElementById('totalAmount').textContent = '$' + formatPrice(total);
}

// ==========================================
// PROFILE & MENU TAB
// ==========================================

function openProfileTab() {
    // Update Active Tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tabs = document.querySelectorAll('.tab');
    tabs[tabs.length - 1].classList.add('active');

    // Toggle Containers
    document.getElementById('ordersContainer').style.display = 'none';
    document.getElementById('profileContainer').style.display = 'block';

    // Load Data
    const name = window.CURRENT_RESTAURANT_NAME || 'Tu Restaurante';
    document.getElementById('profileRestName').innerText = name;
    loadMenuManager();
    loadStoreSettings();
}

// Wrap filterOrders to also reset profile view
const originalFilterOrders = filterOrders;
filterOrders = function (filter) {
    // Show Orders, Hide Profile
    document.getElementById('ordersContainer').style.display = 'block';
    document.getElementById('profileContainer').style.display = 'none';

    originalFilterOrders(filter);
};

function closeProfile() {
    filterOrders('all');
}

// ==========================================
// STORE SETTINGS
// ==========================================

async function loadStoreSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('restaurantes')
            .select('acepta_pedidos, horarios, imagen_url, direccion')
            .eq('id', RESTAURANTE_ID)
            .single();

        if (error) throw error;

        const toggle = document.getElementById('storeToggle');
        toggle.checked = data.acepta_pedidos;
        updateStatusLabel(data.acepta_pedidos);

        document.getElementById('storeSchedule').value = data.horarios || '';
        document.getElementById('storeImage').value = data.imagen_url || '';
        document.getElementById('storeAddress').value = data.direccion || '';

    } catch (error) {
        console.error('Error loading store settings:', error);
    }
}

async function toggleStoreStatus(checkbox) {
    const isOpen = checkbox.checked;
    updateStatusLabel(isOpen); // Optimistic UI

    try {
        const { error } = await supabaseClient
            .from('restaurantes')
            .update({ acepta_pedidos: isOpen })
            .eq('id', RESTAURANTE_ID);

        if (error) throw error;
    } catch (error) {
        console.error('Error toggling status:', error);
        checkbox.checked = !isOpen; // Revert
        updateStatusLabel(!isOpen);
        veroModal.alert('Error actualizando estado: ' + error.message, { type: 'error' });
    }
}

async function updateSchedule() {
    const schedule = document.getElementById('storeSchedule').value;
    try {
        const { error } = await supabaseClient
            .from('restaurantes')
            .update({ horarios: schedule })
            .eq('id', RESTAURANTE_ID);

        if (error) throw error;
        veroModal.alert('Horarios actualizados', { type: 'success' });

        startAutoCloseCheck(schedule);
    } catch (error) {
        console.error('Error updating schedule:', error);
        veroModal.alert('Error actualizando horarios', { type: 'error' });
    }
}

async function updateStoreImage() {
    const imgUrl = document.getElementById('storeImage').value;
    try {
        const { error } = await supabaseClient
            .from('restaurantes')
            .update({ imagen_url: imgUrl })
            .eq('id', RESTAURANTE_ID);

        if (error) throw error;
        veroModal.alert('Imagen de portada actualizada', { type: 'success' });
    } catch (error) {
        console.error('Error updating image:', error);
        veroModal.alert('Error actualizando imagen', { type: 'error' });
    }
}

async function updateAddress() {
    const address = document.getElementById('storeAddress').value;
    try {
        const { error } = await supabaseClient
            .from('restaurantes')
            .update({ direccion: address })
            .eq('id', RESTAURANTE_ID);

        if (error) throw error;
        veroModal.alert('Direccion actualizada', { type: 'success' });
    } catch (error) {
        console.error('Error updating address:', error);
    }
}

// ==========================================
// AUTO-CLOSE LOGIC
// ==========================================
let autoCloseInterval;

function startAutoCloseCheck(scheduleString) {
    if (autoCloseInterval) clearInterval(autoCloseInterval);

    const times = scheduleString.match(/(\d{1,2}):(\d{2})/g);
    if (!times || times.length === 0) return;

    const closeTimeStr = times[times.length - 1];
    const [closeHour, closeMinute] = closeTimeStr.split(':').map(Number);

    autoCloseInterval = setInterval(() => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        if (currentHour === closeHour && currentMinute === closeMinute) {
            const toggle = document.getElementById('storeToggle');
            if (toggle && toggle.checked) {
                toggle.checked = false;
                toggleStoreStatus(toggle);
                veroModal.alert('Horario de cierre cumplido. El local se ha cerrado automaticamente.', { type: 'info', title: 'Cierre automatico' });
            }
        }
    }, 60000);
}

function updateStatusLabel(isOpen) {
    const label = document.getElementById('statusLabel');
    if (isOpen) {
        label.innerHTML = `
            <span style="display:block; width:10px; height:10px; background:var(--success); border-radius:50%; box-shadow: 0 0 10px var(--success);"></span>
            Abierto
        `;
        label.style.color = 'var(--success)';
    } else {
        label.innerHTML = `
            <span style="display:block; width:10px; height:10px; background:var(--danger); border-radius:50%;"></span>
            Cerrado
        `;
        label.style.color = 'var(--danger)';
    }
}

// ==========================================
// MENU MANAGER
// ==========================================

async function loadMenuManager() {
    const list = document.getElementById('menuList');
    const loader = document.getElementById('loadingMenu');

    list.innerHTML = '';
    loader.style.display = 'block';

    try {
        const { data, error } = await supabaseClient
            .from('menu_items')
            .select('*')
            .eq('restaurante_id', RESTAURANTE_ID)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (data.length === 0) {
            list.innerHTML = '<div style="color:var(--gray); text-align:center; padding:1rem;">No hay productos. Agrega el primero!</div>';
        } else {
            menuItemsMap.clear();
            data.forEach(item => menuItemsMap.set(item.id, item));
            list.innerHTML = data.map(item => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:0.75rem; border-radius:8px; margin-bottom:0.5rem;">
                    <div>
                        <div style="color:white; font-weight:600;">${escapeHtml(item.nombre)}</div>
                        <div style="color:var(--gray); font-size:0.8rem;">$${item.precio} - ${escapeHtml(item.categoria)}</div>
                    </div>
                    <button onclick="editProduct('${escapeAttr(item.id)}')" style="background:none; border:none; cursor:pointer; font-size:1.2rem; margin-right:10px;" title="Editar">
                        &#9998;
                    </button>

                    <button onclick="deleteProduct('${escapeAttr(item.id)}')" style="background:none; border:none; cursor:pointer; font-size:1.2rem;" title="Eliminar">
                        &#128465;
                    </button>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading menu:', error);
        list.innerHTML = '<div style="color:red">Error cargando menu</div>';
    } finally {
        loader.style.display = 'none';
    }
}

// ==========================================
// PRODUCT CRUD
// ==========================================
let EDITING_PRODUCT_ID = null;

async function addProduct(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveProduct');
    btn.innerText = 'Guardando...';
    btn.disabled = true;

    const name = document.getElementById('newProdName').value;
    const desc = document.getElementById('newProdDesc').value;
    const options = document.getElementById('newProdOptions').value;
    const limit = document.getElementById('newProdLimit').value || 1;
    const price = document.getElementById('newProdPrice').value;
    const cat = document.getElementById('newProdCat').value;
    const img = document.getElementById('newProdImg').value;

    try {
        if (EDITING_PRODUCT_ID) {
            const { error } = await supabaseClient
                .from('menu_items')
                .update({
                    nombre: name,
                    descripcion: desc,
                    opciones: options ? options : null,
                    limite_opciones: parseInt(limit),
                    precio: price,
                    categoria: cat,
                    imagen_url: img
                })
                .eq('id', EDITING_PRODUCT_ID);

            if (error) throw error;
            veroModal.alert('Producto actualizado', { type: 'success' });
            cancelEdit();

        } else {
            const { error } = await supabaseClient
                .from('menu_items')
                .insert({
                    restaurante_id: RESTAURANTE_ID,
                    nombre: name,
                    descripcion: desc,
                    opciones: options ? options : null,
                    limite_opciones: parseInt(limit),
                    precio: price,
                    categoria: cat,
                    imagen_url: img,
                    disponible: true
                });

            if (error) throw error;
            document.getElementById('addProductForm').reset();
        }

        loadMenuManager();

    } catch (error) {
        veroModal.alert('Error al guardar producto: ' + error.message, { type: 'error' });
    } finally {
        btn.innerText = EDITING_PRODUCT_ID ? 'Guardar Cambios' : '+ Agregar Item';
        btn.disabled = false;
    }
}

function editProduct(itemId) {
    const item = menuItemsMap.get(itemId);
    if (!item) return;
    EDITING_PRODUCT_ID = item.id;

    document.getElementById('newProdName').value = item.nombre;
    document.getElementById('newProdDesc').value = item.descripcion || '';
    document.getElementById('newProdPrice').value = item.precio;
    document.getElementById('newProdCat').value = item.categoria;
    document.getElementById('newProdOptions').value = item.opciones || '';
    document.getElementById('newProdLimit').value = item.limite_opciones || 1;
    document.getElementById('newProdImg').value = item.imagen_url || '';

    const btn = document.getElementById('btnSaveProduct');
    btn.innerText = 'Guardar Cambios';
    document.getElementById('btnCancelEdit').style.display = 'block';

    document.getElementById('addProductForm').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    EDITING_PRODUCT_ID = null;
    document.getElementById('addProductForm').reset();

    const btn = document.getElementById('btnSaveProduct');
    btn.innerText = '+ Agregar Item';
    document.getElementById('btnCancelEdit').style.display = 'none';
}

async function deleteProduct(id) {
    if (!await veroModal.confirm('Eliminar este producto del menu?', { type: 'error', title: 'Eliminar producto', confirmText: 'Eliminar' })) return;

    try {
        const { error } = await supabaseClient
            .from('menu_items')
            .delete()
            .eq('id', id);

        if (error) throw error;
        loadMenuManager();

    } catch (error) {
        veroModal.alert('Error eliminando producto', { type: 'error' });
    }
}

// ==========================================
// ACCOUNT
// ==========================================

function deleteCommerceAccount() {
    deleteAccount('Esta accion eliminara permanentemente tu cuenta, tu restaurante y todos tus datos.\n\nNo se puede deshacer.');
}
