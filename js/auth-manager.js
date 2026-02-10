
// Configuration
const SUPABASE_URL = 'https://dsxtpgkdxkplwhrvbotg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeHRwZ2tkeGtwbHdocnZib3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NjE2MzcsImV4cCI6MjA4NTUzNzYzN30.nY-PrzOyfmniy_nzZYIq36GWTwcb4ENIchOOA7cbc18';

// Initialize Supabase
let supabaseClient;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            persistSession: true,
            storage: window.sessionStorage,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
    console.log('Auth Manager Initialized');
} catch (e) {
    console.error('Supabase Init Failed', e);
}

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

            console.log('User created:', authData.user.id);

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

            // 3. Create Specific Profile (Driver/Commerce)
            // This automates the previously manual SQL step
            try {
                if (dbRole === 'repartidor') {
                    await supabaseClient.from('repartidores').insert({
                        usuario_id: authData.user.id,
                        nombre: name,
                        telefono: 'Sin registrar',
                        vehiculo: 'moto', // Default valid value
                        patente: 'N/A',
                        disponible: false
                    });
                } else if (dbRole === 'comercio') {
                    await supabaseClient.from('restaurantes').insert({
                        usuario_id: authData.user.id,
                        nombre: name, // Default to user name
                        telefono: 'Sin registrar',
                        direccion: 'Sin dirección',
                        categoria: 'Varios',
                        zona: 'General',
                        descripcion: 'Nuevo comercio',
                        activo: true, // Auto-approve for testing
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
                // We don't block flow, but user might see empty panel
            }

            showMessage('¡Cuenta creada con éxito! Redirigiendo...', 'success');

            // 4. Redirect based on role
            setTimeout(() => redirectUser(role), 1500);

        } else {
            // --- LOGIN FLOW ---

            // 1. Sign In
            const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (authError) throw authError;

            console.log('Logged in:', authData.user.id);
            showMessage('Sesión iniciada. Verificando rol...', 'success');

            // 2. Fetch Role
            const { data: userData, error: userError } = await supabaseClient
                .from('usuarios')
                .select('rol')
                .eq('id', authData.user.id)
                .single();

            if (userError) {
                console.error('Role fetch error:', userError);
                // Fallback or explicit error
                throw new Error('No se pudo obtener tu perfil.');
            }

            // 3. Redirect
            const role = userData ? userData.rol : 'consumer'; // Default fallback
            setTimeout(() => redirectUser(role), 1000);
        }

    } catch (error) {
        console.error(error);
        alert('Error: ' + error.message + '\n\nDetalles: ' + JSON.stringify(error));
        showMessage(error.message, 'error');
    } finally {
        submitBtn.classList.remove('btn-loading');
        submitBtn.disabled = false;
    }
}

function redirectUser(role) {
    // Role can be english (frontend) or spanish (backend)
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
