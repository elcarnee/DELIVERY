// ==========================================
// SUPABASE SHARED CONFIGURATION
// ==========================================
// Single source of truth for Supabase credentials.
// All pages import this instead of duplicating config.

const SUPABASE_URL = 'https://dsxtpgkdxkplwhrvbotg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzeHRwZ2tkeGtwbHdocnZib3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NjE2MzcsImV4cCI6MjA4NTUzNzYzN30.nY-PrzOyfmniy_nzZYIq36GWTwcb4ENIchOOA7cbc18';

/**
 * Creates and returns a configured Supabase client.
 * Uses sessionStorage for session persistence.
 * @returns {object|null} Supabase client instance or null on error
 */
function createSupabaseClient() {
    try {
        const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                persistSession: true,
                storage: window.sessionStorage,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        return client;
    } catch (error) {
        console.error('❌ Supabase init failed:', error);
        return null;
    }
}

/**
 * Utility: Format price for AR locale
 */
function formatPrice(price) {
    return Number(price).toLocaleString('es-AR');
}

/**
 * Utility: Check if a timestamp is from today
 */
function isToday(timestamp) {
    const today = new Date();
    const date = new Date(timestamp);
    return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
}

/**
 * Utility: Human-readable time ago
 */
function getTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diff = Math.floor((now - then) / 1000 / 60);

    if (diff < 1) return 'Ahora';
    if (diff < 60) return `${diff} min`;
    if (diff < 1440) return `${Math.floor(diff / 60)} hs`;
    return `${Math.floor(diff / 1440)} días`;
}

/**
 * Security: Escape HTML entities to prevent XSS
 */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
const escapeAttr = escapeHtml;

/**
 * Utility: Play notification sound
 */
function playNotificationSound() {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBzGJ0fPTgjMGHm7A7+OZURE');
    audio.play().catch(() => { });
}
