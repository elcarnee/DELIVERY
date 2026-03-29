// ==========================================
// DRIVER PANEL (repartidores-panel.js)
// ==========================================
// Depends on: js/supabase-config.js, js/auth-manager.js, js/vero-modal.js
// Uses singleton window.supabaseClient (auto-inits via property getter)

let REPARTIDOR_ID = null;
let allDeliveries = [];
let isOnline = false;

// ==========================================
// INITIALIZATION
// ==========================================

function initDriver() {
    checkSession('repartidor', async (session, user) => {
        try {
            const { data: driver, error: driverError } = await supabaseClient
                .from('repartidores')
                .select('id, nombre, disponible')
                .eq('usuario_id', session.user.id)
                .single();

            if (driverError || !driver) {
                await veroModal.alert('No tienes un perfil de repartidor activo. Cerrando sesion...', { type: 'error' });
                await supabaseClient.auth.signOut();
                window.location.href = 'auth.html';
                return;
            }

            REPARTIDOR_ID = driver.id;
            isOnline = driver.disponible;

            // Personalize UI
            const profileBtn = document.querySelector('button[onclick="openProfile()"]');
            if (profileBtn && driver.nombre) {
                profileBtn.innerText = '\u{1F464} ' + driver.nombre.split(' ')[0];
            }

            updateOnlineStatusUI();
            loadDeliveries();
            subscribeToChanges();
        } catch (error) {
            console.error('Init Error:', error);
            document.getElementById('deliveriesContainer').innerHTML =
                '<div class="empty-state" style="color:red">Error de conexion: ' + escapeHtml(error.message) + '</div>';
        }
    });
}

document.addEventListener('DOMContentLoaded', initDriver);

// ==========================================
// ONLINE/OFFLINE TOGGLE
// ==========================================

async function toggleStatus() {
    if (!REPARTIDOR_ID) return;

    const newState = !isOnline;

    // Optimistic update
    isOnline = newState;
    updateOnlineStatusUI();

    if (!isOnline) {
        renderDeliveries();
    }

    const { error } = await supabaseClient
        .from('repartidores')
        .update({ disponible: isOnline })
        .eq('id', REPARTIDOR_ID);

    if (error) {
        console.error('Error updating status:', error);
        veroModal.alert('Error actualizando estado', { type: 'error' });
        // Revert
        isOnline = !newState;
        updateOnlineStatusUI();
    } else {
        loadDeliveries();
    }
}

function updateOnlineStatusUI() {
    const toggle = document.getElementById('statusToggle');
    const statusText = document.getElementById('statusText');

    if (isOnline) {
        toggle.classList.add('active');
        statusText.textContent = 'Conectado \u2713';
    } else {
        toggle.classList.remove('active');
        statusText.textContent = 'Desconectado';
    }
}

// ==========================================
// LOAD DELIVERIES
// ==========================================

async function loadDeliveries() {
    if (!REPARTIDOR_ID) return;

    const container = document.getElementById('deliveriesContainer');

    // Calculate Start of Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    try {
        const { data: available, error: availError } = await supabaseClient
            .from('pedidos')
            .select(`
                id, estado, total, created_at, direccion_entrega, restaurante_id, numero_pedido, metodo_pago,
                cliente_nombre, cliente_telefono, cliente_direccion,
                restaurante:restaurantes (nombre, direccion, telefono),
                cliente:clientes (nombre, telefono)
            `)
            .eq('estado', 'listo')
            .is('repartidor_id', null)
            .gte('created_at', todayISO)
            .order('created_at', { ascending: false });

        if (availError) throw availError;

        const { data: assigned, error: assignError } = await supabaseClient
            .from('pedidos')
            .select(`
                id, estado, total, created_at, direccion_entrega, restaurante_id, numero_pedido, metodo_pago,
                cliente_nombre, cliente_telefono, cliente_direccion,
                restaurante:restaurantes (nombre, direccion, telefono),
                cliente:clientes (nombre, telefono)
            `)
            .eq('repartidor_id', REPARTIDOR_ID)
            .in('estado', ['en_camino'])
            .order('created_at', { ascending: false });

        if (assignError) throw assignError;

        const mapDelivery = (d) => ({
            ...d,
            restaurante_nombre: d.restaurante ? d.restaurante.nombre : 'Restaurante Desconocido',
            restaurante_direccion: d.restaurante ? d.restaurante.direccion : 'Sin direccion',
            cliente_nombre: d.cliente ? d.cliente.nombre : (d.cliente_nombre || 'Cliente'),
            cliente_telefono: d.cliente ? d.cliente.telefono : (d.cliente_telefono || ''),
            cliente_direccion: d.cliente_direccion || d.direccion_entrega || 'Sin direccion'
        });

        allDeliveries = [...assigned.map(mapDelivery), ...available.map(mapDelivery)];

        if (!isOnline) {
            allDeliveries = allDeliveries.filter(d => d.repartidor_id === REPARTIDOR_ID);
        }

        renderDeliveries();
        await updateStats();

    } catch (error) {
        console.error('Error loading deliveries:', error);
        container.innerHTML = `
            <div class="empty-state" style="color:red">
                <h3>Error cargando entregas</h3>
                <p>${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

// ==========================================
// REALTIME SUBSCRIPTION
// ==========================================

function subscribeToChanges() {
    supabaseClient
        .channel('deliveries-changes')
        .on('postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'pedidos'
            },
            (payload) => {
                const relevantStates = ['listo', 'en_camino', 'entregado'];
                if (payload.new && !relevantStates.includes(payload.new.estado)) return;
                if (payload.new && payload.new.repartidor_id && payload.new.repartidor_id !== REPARTIDOR_ID) return;
                loadDeliveries();
                playNotificationSound();
            }
        )
        .subscribe();
}

// ==========================================
// RENDER
// ==========================================

function renderDeliveries() {
    const container = document.getElementById('deliveriesContainer');

    if (!isOnline) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">😴</div>
                <h3>Estas desconectado</h3>
                <p>Activa el estado "Conectado" para ver entregas disponibles</p>
            </div>
        `;
        return;
    }

    if (allDeliveries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No hay entregas disponibles</h3>
                <p>Nuevas entregas apareceran aqui automaticamente</p>
            </div>
        `;
        return;
    }

    container.innerHTML = allDeliveries.map(delivery => renderDeliveryCard(delivery)).join('');
}

function renderDeliveryCard(delivery) {
    const isAssigned = delivery.repartidor_id === REPARTIDOR_ID;

    return `
        <div class="delivery-card">
            <div class="delivery-header">
                <div class="delivery-number">${escapeHtml(delivery.numero_pedido)}</div>
                <div class="delivery-amount">$${formatPrice(delivery.total)}</div>
            </div>

            <div class="delivery-info">
                <div class="info-row">
                    <span class="info-icon">🏪</span>
                    <div class="info-content">
                        <div class="info-label">Retirar en:</div>
                        <div class="info-value">${escapeHtml(delivery.restaurante?.nombre || 'Restaurante Desconocido')}</div>
                        <div style="font-size: 0.875rem; color: var(--gray); margin-top: 0.25rem;">
                            ${escapeHtml(delivery.restaurante?.direccion || 'Sin direccion')}
                        </div>
                    </div>
                </div>

                <div class="info-row">
                    <span class="info-icon">📍</span>
                    <div class="info-content">
                        <div class="info-label">Entregar a:</div>
                        <div class="info-value">${escapeHtml(delivery.cliente_nombre)}</div>
                        <div style="font-size: 0.875rem; color: var(--gray); margin-top: 0.25rem;">
                            ${escapeHtml(delivery.cliente_direccion)}
                        </div>
                    </div>
                </div>

                <div class="info-row">
                    <span class="info-icon">📞</span>
                    <div class="info-content">
                        <div class="info-label">Contacto:</div>
                        <div class="info-value">${escapeHtml(delivery.cliente_telefono)}</div>
                    </div>
                </div>

                <div class="info-row">
                    <span class="info-icon">💳</span>
                    <div class="info-content">
                        <div class="info-label">Pago:</div>
                        <div class="info-value">${escapeHtml(delivery.metodo_pago)}</div>
                    </div>

                    <div class="info-row" style="margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid rgba(255,255,255,0.1);">
                        <div class="info-label">📍 Retiro</div>
                        <div class="info-value">
                            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.restaurante_direccion || '')}" target="_blank" style="color:var(--primary); text-decoration:none;">
                                ${escapeHtml(delivery.restaurante_direccion || 'Sin direccion')} 🔗
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div class="action-buttons">
                ${!isAssigned ? `
                    <button class="btn btn-accept" onclick="acceptDelivery('${delivery.id}')" style="width: 100%; border-radius: 16px; padding: 1.25rem;">
                        ✓ Aceptar Entrega
                    </button>
                    <button class="btn btn-reject" onclick="rejectDelivery('${delivery.id}')" style="width: 100%; border-radius: 16px; padding: 1.25rem; margin-top: 0.5rem;">
                        ✕ Rechazar
                    </button>
                ` : `
                    <div style="background:rgba(46, 204, 113, 0.05); padding:1.25rem; border-radius:16px; margin-bottom:1rem; border:1px solid rgba(46, 204, 113, 0.2);">

                        ${!delivery.retirado ? `
                            <!-- STAGE 1: PICKUP -->
                            <h4 style="margin-bottom:1rem; color:var(--accent); font-size:1.1rem;">🏪 Paso 1: Ir al Local</h4>

                            <div style="margin-bottom:1.5rem; background:rgba(0,0,0,0.3); padding:1rem; border-radius:12px;">
                                <div style="font-size:0.9rem; color:var(--gray); margin-bottom:0.25rem;">Direccion de retiro:</div>
                                <div style="font-weight:bold; font-size:1.1rem; color:white; margin-bottom:0.75rem;">${escapeHtml(delivery.restaurante_direccion || 'Sin direccion')}</div>

                                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.restaurante_direccion || '')}" target="_blank"
                                   class="btn" style="background:#3b82f6; color:white; display:flex; align-items:center; justify-content:center; gap:0.5rem; text-decoration:none; width:100%; padding:1.1rem; border-radius:12px; font-weight:700;">
                                    🗺️ Abrir en Maps
                                </a>
                            </div>

                            <button class="btn" onclick="confirmPickup('${delivery.id}')" style="width:100%; background:var(--accent); color:white; padding:1.25rem; font-size:1.2rem; font-weight:800; border-radius:16px; margin-bottom:0.5rem;">
                                📦 YA RETIRE EL PEDIDO
                            </button>

                        ` : `
                            <!-- STAGE 2: DELIVERY -->
                            <h4 style="margin-bottom:1rem; color:var(--success); font-size:1.1rem;">🚀 Paso 2: Ir al Cliente</h4>

                            <div style="margin-bottom:1.5rem; background:rgba(0,0,0,0.3); padding:1rem; border-radius:12px;">
                                <div style="font-size:0.9rem; color:var(--gray); margin-bottom:0.25rem;">Entregar en:</div>
                                <div style="font-weight:bold; font-size:1.1rem; color:white; margin-bottom:0.75rem;">${escapeHtml(delivery.cliente_direccion)}</div>

                                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.cliente_direccion)}" target="_blank"
                                   class="btn" style="background:#3b82f6; color:white; display:flex; align-items:center; justify-content:center; gap:0.5rem; margin-bottom:0.5rem; text-decoration:none; width:100%; padding:1.1rem; border-radius:12px; font-weight:700;">
                                    🗺️ Abrir en Maps
                                </a>
                            </div>

                            <a href="tel:${delivery.cliente_telefono}"
                               class="btn" style="background:rgba(255,255,255,0.1); color:white; display:flex; align-items:center; justify-content:center; gap:0.5rem; margin-bottom:1.5rem; text-decoration:none; width:100%; padding:1rem; border-radius:12px;">
                                📞 Llamar al Cliente
                            </a>

                            <button class="btn btn-complete" onclick="completeDelivery('${delivery.id}')" style="width:100%; padding:1.25rem; font-size:1.2rem; font-weight:800; background:var(--success); color:white; border-radius:16px; margin-bottom:0.5rem;">
                                ✅ ENTREGADO AL CLIENTE
                            </button>
                        `}

                        <button class="btn" onclick="releaseDelivery('${delivery.id}')" style="width:100%; background:transparent; color:var(--gray); border:1px solid rgba(255,255,255,0.1); padding:1rem; font-size:0.9rem; border-radius:12px; margin-top:1rem;">
                            ⚠️ Tuve un problema (Liberar pedido)
                        </button>
                    </div>
                `}
            </div>
        </div>
    `;
}

// ==========================================
// DELIVERY ACTIONS
// ==========================================

async function acceptDelivery(deliveryId) {
    if (!await veroModal.confirm('Aceptar esta entrega?', { type: 'info', title: 'Aceptar entrega', confirmText: 'Aceptar' })) return;

    // Optimistic update
    const deliveryIndex = allDeliveries.findIndex(d => d.id === deliveryId);
    if (deliveryIndex !== -1) {
        allDeliveries[deliveryIndex].repartidor_id = REPARTIDOR_ID;
        allDeliveries[deliveryIndex].estado = 'en_camino';
        renderDeliveries();
    }

    const { error } = await supabaseClient
        .from('pedidos')
        .update({
            repartidor_id: REPARTIDOR_ID,
            estado: 'en_camino',
            hora_en_camino: new Date().toISOString()
        })
        .eq('id', deliveryId)
        .eq('estado', 'listo')
        .is('repartidor_id', null);

    if (error) {
        console.error('Error accepting delivery:', error);
        veroModal.alert('Error aceptando entrega', { type: 'error' });
        loadDeliveries(); // Revert
    }
}

async function confirmPickup(deliveryId) {
    if (!await veroModal.confirm('Ya retiraste el pedido del local?', { type: 'info', title: 'Confirmar retiro', confirmText: 'Si, ya lo tengo' })) return;

    // Optimistic update
    const deliveryIndex = allDeliveries.findIndex(d => d.id === deliveryId);
    if (deliveryIndex !== -1) {
        allDeliveries[deliveryIndex].retirado = true;
        renderDeliveries();
    }

    const { error } = await supabaseClient
        .from('pedidos')
        .update({ retirado: true })
        .eq('id', deliveryId)
        .eq('repartidor_id', REPARTIDOR_ID);

    if (error) {
        console.error('Error confirming pickup:', error);
        veroModal.alert('Error actualizando pedido', { type: 'error' });
        loadDeliveries(); // Revert
    }
}

async function completeDelivery(deliveryId) {
    if (!await veroModal.confirm('Confirmar que entregaste el pedido?', { type: 'success', title: 'Completar entrega', confirmText: 'Entregado' })) return;

    const { error } = await supabaseClient
        .from('pedidos')
        .update({
            estado: 'entregado',
            hora_entregado: new Date().toISOString()
        })
        .eq('id', deliveryId)
        .eq('repartidor_id', REPARTIDOR_ID);

    if (error) {
        veroModal.alert('Error completando entrega', { type: 'error' });
        console.error(error);
    } else {
        loadDeliveries();
    }
}

async function releaseDelivery(deliveryId) {
    if (!await veroModal.confirm('Liberar este pedido? Volvera a estar disponible para otros repartidores.', { type: 'warning', title: 'Liberar pedido', confirmText: 'Liberar' })) return;

    const { error } = await supabaseClient
        .from('pedidos')
        .update({
            repartidor_id: null,
            estado: 'listo',
            hora_en_camino: null,
            retirado: false
        })
        .eq('id', deliveryId)
        .eq('repartidor_id', REPARTIDOR_ID);

    if (error) {
        console.error('Error details:', error);
        veroModal.alert('Error: ' + (error.message || 'Intenta nuevamente'), { type: 'error' });
    } else {
        veroModal.alert('Pedido liberado correctamente.', { type: 'success' });
        loadDeliveries();
    }
}

async function rejectDelivery(deliveryId) {
    if (!await veroModal.confirm('Ocultar este pedido?', { type: 'warning', confirmText: 'Ocultar' })) return;

    allDeliveries = allDeliveries.filter(d => d.id !== deliveryId);
    renderDeliveries();
}

// ==========================================
// PROFILE
// ==========================================

async function openProfile() {
    try {
        const { data: driver, error } = await supabaseClient
            .from('repartidores')
            .select('*')
            .eq('id', REPARTIDOR_ID)
            .single();

        if (error) throw error;

        document.getElementById('profileName').value = driver.nombre || '';
        document.getElementById('profilePhone').value = driver.telefono || '';
        document.getElementById('profileVehicle').value = driver.vehiculo || 'moto';
        document.getElementById('profilePlate').value = driver.patente || '';

        document.getElementById('profileModal').classList.add('active');
    } catch (err) {
        console.error('Error fetching profile:', err);
        veroModal.alert('No se pudo cargar el perfil', { type: 'error' });
    }
}

function closeProfile() {
    document.getElementById('profileModal').classList.remove('active');
}

async function saveProfile(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = 'Guardando...';
    btn.disabled = true;

    const updates = {
        nombre: document.getElementById('profileName').value,
        telefono: document.getElementById('profilePhone').value,
        vehiculo: document.getElementById('profileVehicle').value,
        patente: document.getElementById('profilePlate').value
    };

    try {
        const { error } = await supabaseClient
            .from('repartidores')
            .update(updates)
            .eq('id', REPARTIDOR_ID);

        if (error) throw error;

        await veroModal.alert('Perfil actualizado correctamente', { type: 'success' });
        closeProfile();

    } catch (error) {
        console.error('Error saving profile:', error);
        veroModal.alert('Error al guardar: ' + error.message, { type: 'error' });
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function deleteDriverAccount() {
    deleteAccount('Esta accion eliminara permanentemente tu cuenta de repartidor y todos tus datos.\n\nNo se puede deshacer.');
}

// ==========================================
// HISTORY
// ==========================================

let historyLoaded = false;

function switchTab(tab) {
    const activeBtn = document.getElementById('tabActive');
    const historyBtn = document.getElementById('tabHistory');
    const activeContainer = document.getElementById('deliveriesContainer');
    const historyContainer = document.getElementById('historyContainer');

    if (tab === 'active') {
        activeBtn.style.color = 'var(--primary)';
        activeBtn.style.fontWeight = 'bold';
        activeBtn.style.borderBottom = '2px solid var(--primary)';

        historyBtn.style.color = 'var(--gray)';
        historyBtn.style.fontWeight = 'normal';
        historyBtn.style.borderBottom = '2px solid transparent';

        activeContainer.style.display = 'block';
        historyContainer.style.display = 'none';
    } else {
        historyBtn.style.color = 'var(--primary)';
        historyBtn.style.fontWeight = 'bold';
        historyBtn.style.borderBottom = '2px solid var(--primary)';

        activeBtn.style.color = 'var(--gray)';
        activeBtn.style.fontWeight = 'normal';
        activeBtn.style.borderBottom = '2px solid transparent';

        activeContainer.style.display = 'none';
        historyContainer.style.display = 'block';

        if (!historyLoaded) {
            loadHistory();
        }
    }
}

async function loadHistory() {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const { data, error } = await supabaseClient
            .from('pedidos')
            .select(`
                id, total, created_at, numero_pedido, metodo_pago,
                restaurante:restaurantes (nombre)
            `)
            .eq('repartidor_id', REPARTIDOR_ID)
            .eq('estado', 'entregado')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        historyLoaded = true;

        if (data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Sin historial</h3>
                    <p>Aun no has completado ninguna entrega.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(order => `
            <div class="delivery-card" style="opacity:0.8;">
                <div class="delivery-header">
                    <div class="delivery-number">#${escapeHtml(order.numero_pedido)}</div>
                    <div class="delivery-amount" style="color:var(--success);">$${formatPrice(order.total)}</div>
                </div>
                <div style="color:var(--gray); font-size:0.9rem; margin-bottom:0.5rem;">
                    ${new Date(order.created_at).toLocaleDateString()} ${new Date(order.created_at).toLocaleTimeString().slice(0, 5)}
                </div>
                <div style="font-weight:bold; margin-bottom:0.25rem;">
                    🏪 ${escapeHtml(order.restaurante?.nombre || 'Restaurante')}
                </div>
                <div class="badge badge-success" style="display:inline-block; margin-top:0.5rem;">
                    Entregado
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading history:', error);
        container.innerHTML = '<div style="color:red; padding:1rem;">Error cargando historial: ' + escapeHtml(error.message) + '</div>';
    }
}

// ==========================================
// STATS
// ==========================================

async function updateStats() {
    if (!REPARTIDOR_ID) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    try {
        const { data, error } = await supabaseClient
            .from('pedidos')
            .select('total')
            .eq('repartidor_id', REPARTIDOR_ID)
            .eq('estado', 'entregado')
            .gte('created_at', todayISO);

        if (error) throw error;

        const todayCount = data ? data.length : 0;
        const todaySum = data ? data.reduce((sum, row) => sum + (Number(row.total) || 0), 0) : 0;

        document.getElementById('todayDeliveries').textContent = todayCount;
        document.getElementById('todayEarnings').textContent = '$' + formatPrice(todaySum);
    } catch (err) {
        console.error('Error loading stats:', err);
        document.getElementById('todayDeliveries').textContent = '-';
        document.getElementById('todayEarnings').textContent = '-';
    }

    // No ratings table yet - show placeholder
    document.getElementById('rating').textContent = '-';
}
