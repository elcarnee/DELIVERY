// ==========================================
// AUTH MANAGER
// ==========================================
// Depends on: js/supabase-config.js (must be loaded first)
// Uses singleton supabaseClient from window.supabaseClient

/**
 * Check session and validate role against DB.
 * @param {string|null} requiredRole - DB role ('comercio', 'repartidor') or null for consumer (no redirect if no session)
 * @param {function} onSuccess - Called with (session, userData) when session is valid and role matches
 */
async function checkSession(requiredRole, onSuccess) {
    const client = window.supabaseClient;
    if (!client) {
        if (requiredRole) window.location.href = 'auth.html';
        return;
    }

    const { data: { session } } = await client.auth.getSession();

    if (!session) {
        if (requiredRole) window.location.href = 'auth.html';
        else if (onSuccess) onSuccess(null, null);
        return;
    }

    if (!requiredRole) {
        // Consumer: no role check needed, just pass session
        if (onSuccess) onSuccess(session, null);
        return;
    }

    // Verify role in DB
    const { data: user, error: userError } = await client
        .from('usuarios')
        .select('rol')
        .eq('id', session.user.id)
        .single();

    if (userError || !user) {
        await veroModal.alert('Error verificando usuario. Inicia sesion nuevamente.', { type: 'error' });
        window.location.href = 'auth.html';
        return;
    }

    if (user.rol !== requiredRole) {
        // Redirect to correct panel
        if (user.rol === 'comercio') window.location.href = 'comercios-panel.html';
        else if (user.rol === 'repartidor') window.location.href = 'repartidores-panel.html';
        else window.location.href = 'index.html';
        return;
    }

    if (onSuccess) onSuccess(session, user);
}

/**
 * Sign out and redirect to auth page.
 */
async function handleLogout() {
    const client = window.supabaseClient;
    if (client) {
        const { error } = await client.auth.signOut();
        if (error) console.error('Error signing out:', error);
    }
    localStorage.removeItem('delivery_cart');
    window.location.href = 'auth.html';
}

/**
 * Delete account via RPC, sign out, redirect.
 * @param {string} confirmMessage - Custom confirmation message
 */
async function deleteAccount(confirmMessage) {
    const msg = confirmMessage || 'Esta accion eliminara permanentemente tu cuenta y todos tus datos.\n\nNo se puede deshacer.';
    if (!await veroModal.confirm(msg, { type: 'error', title: 'Estas seguro?', confirmText: 'Eliminar cuenta' })) return;

    const client = window.supabaseClient;
    try {
        const { error } = await client.rpc('delete_own_user');
        if (error) throw error;

        await veroModal.alert('Tu cuenta ha sido eliminada correctamente.', { type: 'success' });
        await client.auth.signOut();
        localStorage.clear();
        window.location.href = 'auth.html';
    } catch (error) {
        console.error('Error deleting account:', error);
        veroModal.alert('No se pudo eliminar la cuenta: ' + error.message, { type: 'error' });
    }
}

// ==========================================
// AUTH PAGE FUNCTIONS (used by auth.html)
// ==========================================

async function handleAuth(event) {
    event.preventDefault();

    const msgBox = document.getElementById('messageBox');
    const submitBtn = document.getElementById('submitBtn');
    msgBox.style.display = 'none';
    msgBox.className = '';

    const client = window.supabaseClient;
    if (!client) {
        showMessage('Error de conexion con Supabase', 'error');
        return;
    }

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const isRegister = document.getElementById('registerFields').style.display !== 'none';

    submitBtn.classList.add('btn-loading');
    submitBtn.disabled = true;

    try {
        if (isRegister) {
            const name = document.getElementById('name').value;
            const role = document.getElementById('selectedRole').value;

            if (!name) throw new Error('Por favor ingresa tu nombre');

            const { data: authData, error: authError } = await client.auth.signUp({
                email: email,
                password: password,
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error('No se pudo crear el usuario');

            const roleMap = {
                'consumer': 'cliente',
                'commerce': 'comercio',
                'driver': 'repartidor'
            };
            const dbRole = roleMap[role];
            if (!dbRole) throw new Error('Rol no valido');

            const { error: dbError } = await client
                .from('usuarios')
                .insert({
                    id: authData.user.id,
                    email: email,
                    nombre: name,
                    rol: dbRole
                });

            if (dbError) {
                console.error('DB Insert Error:', dbError);
                throw new Error('Error guardando perfil: ' + dbError.message);
            }

            try {
                if (dbRole === 'repartidor') {
                    await client.from('repartidores').insert({
                        usuario_id: authData.user.id,
                        nombre: name,
                        telefono: 'Sin registrar',
                        vehiculo: 'moto',
                        patente: 'N/A',
                        disponible: false
                    });
                } else if (dbRole === 'comercio') {
                    await client.from('restaurantes').insert({
                        usuario_id: authData.user.id,
                        nombre: name,
                        telefono: 'Sin registrar',
                        direccion: 'Sin direccion',
                        categoria: 'Varios',
                        zona: 'General',
                        descripcion: 'Nuevo comercio',
                        activo: true,
                        acepta_pedidos: false
                    });
                } else if (dbRole === 'cliente') {
                    await client.from('clientes').insert({
                        usuario_id: authData.user.id,
                        nombre: name,
                        telefono: '',
                        direccion: ''
                    });
                }
            } catch (profileErr) {
                console.error('Auto-profile creation failed:', profileErr);
            }

            showMessage('Cuenta creada con exito! Redirigiendo...', 'success');
            setTimeout(() => redirectUser(role), 1500);

        } else {
            const { data: authData, error: authError } = await client.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (authError) throw authError;

            showMessage('Sesion iniciada. Verificando rol...', 'success');

            const { data: userData, error: userError } = await client
                .from('usuarios')
                .select('rol')
                .eq('id', authData.user.id)
                .single();

            if (userError) {
                console.error('Role fetch error:', userError);
                throw new Error('No se pudo obtener tu perfil.');
            }

            const role = userData ? userData.rol : 'consumer';
            setTimeout(() => redirectUser(role), 1000);
        }

    } catch (error) {
        console.error(error);
        veroModal.alert('Error: ' + error.message, { type: 'error', title: 'Error de autenticacion' });
        showMessage(error.message, 'error');
    } finally {
        submitBtn.classList.remove('btn-loading');
        submitBtn.disabled = false;
    }
}

function redirectUser(role) {
    switch (role) {
        case 'commerce':
        case 'comercio':
            window.location.href = 'comercios-panel.html';
            break;
        case 'driver':
        case 'repartidor':
            window.location.href = 'repartidores-panel.html';
            break;
        case 'consumer':
        case 'cliente':
        default:
            window.location.href = 'index.html';
            break;
    }
}

function showMessage(text, type) {
    const msgBox = document.getElementById('messageBox');
    if (!msgBox) return;
    msgBox.textContent = text;
    msgBox.className = type;
    msgBox.style.display = 'block';
}
