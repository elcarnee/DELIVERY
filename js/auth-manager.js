// ==========================================
// AUTH MANAGER
// ==========================================
// Depends on: js/supabase-config.js (must be loaded first)

// Initialize Supabase using shared config
let supabaseClient = createSupabaseClient();

async function handleAuth(event) {
    event.preventDefault();

    // Clear messages
    const msgBox = document.getElementById('messageBox');
    const submitBtn = document.getElementById('submitBtn');
    msgBox.style.display = 'none';
    msgBox.className = '';

    if (!supabaseClient) {
        showMessage('Error de conexión con Supabase', 'error');
        return;
    }

    // Get Data
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const isRegister = document.getElementById('registerFields').style.display !== 'none';

    submitBtn.classList.add('btn-loading');
    submitBtn.disabled = true;

    try {
        if (isRegister) {
            // --- REGISTRATION FLOW ---
            const name = document.getElementById('name').value;
            const role = document.getElementById('selectedRole').value;

            if (!name) throw new Error('Por favor ingresa tu nombre');

            // 1. Sign Up
            const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error('No se pudo crear el usuario');

            // Map roles to DB expected values (Spanish)
            const roleMap = {
                'consumer': 'cliente',
                'commerce': 'comercio',
                'driver': 'repartidor'
            };
            const dbRole = roleMap[role] || role;

            // 2. Insert into 'usuarios' table
            const { error: dbError } = await supabaseClient
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

            // 3. Create Specific Profile (Driver/Commerce/Client)
            try {
                if (dbRole === 'repartidor') {
                    await supabaseClient.from('repartidores').insert({
                        usuario_id: authData.user.id,
                        nombre: name,
                        telefono: 'Sin registrar',
                        vehiculo: 'moto',
                        patente: 'N/A',
                        disponible: false
                    });
                } else if (dbRole === 'comercio') {
                    await supabaseClient.from('restaurantes').insert({
                        usuario_id: authData.user.id,
                        nombre: name,
                        telefono: 'Sin registrar',
                        direccion: 'Sin dirección',
                        categoria: 'Varios',
                        zona: 'General',
                        descripcion: 'Nuevo comercio',
                        activo: true,
                        acepta_pedidos: false
                    });
                } else if (dbRole === 'cliente') {
                    await supabaseClient.from('clientes').insert({
                        usuario_id: authData.user.id,
                        nombre: name,
                        telefono: '',
                        direccion: ''
                    });
                }
            } catch (profileErr) {
                console.error('Auto-profile creation failed:', profileErr);
            }

            showMessage('¡Cuenta creada con éxito! Redirigiendo...', 'success');
            setTimeout(() => redirectUser(role), 1500);

        } else {
            // --- LOGIN FLOW ---
            const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (authError) throw authError;

            showMessage('Sesión iniciada. Verificando rol...', 'success');

            // Fetch Role
            const { data: userData, error: userError } = await supabaseClient
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
        veroModal.alert('Error: ' + error.message, { type: 'error', title: 'Error de autenticación' });
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
    msgBox.textContent = text;
    msgBox.className = type;
    msgBox.style.display = 'block';
}
