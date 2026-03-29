// ==========================================
// VERO MODAL SYSTEM
// ==========================================
// Promise-based modal replacements for native alert/confirm.
// Auto-injects CSS and root container on load.

(function () {
    'use strict';

    // Local reference to escapeHtml (from supabase-config.js) with inline fallback
    const _esc = typeof escapeHtml === 'function' ? escapeHtml : function (str) {
        if (str == null) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
        .vero-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.2s ease;
            padding: 1rem;
        }
        .vero-modal-overlay.vero-modal-visible {
            opacity: 1;
        }
        .vero-modal-box {
            background: #1E293B;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 2rem;
            max-width: 420px;
            width: 100%;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            transform: translateY(20px) scale(0.95);
            transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .vero-modal-visible .vero-modal-box {
            transform: translateY(0) scale(1);
        }
        .vero-modal-icon {
            font-size: 2.5rem;
            text-align: center;
            margin-bottom: 1rem;
        }
        .vero-modal-title {
            font-family: 'Poppins', sans-serif;
            font-size: 1.25rem;
            font-weight: 700;
            color: #F8FAFC;
            text-align: center;
            margin-bottom: 0.5rem;
        }
        .vero-modal-msg {
            color: #94a3b8;
            text-align: center;
            line-height: 1.6;
            font-size: 0.95rem;
            margin-bottom: 1.5rem;
            white-space: pre-line;
        }
        .vero-modal-actions {
            display: flex;
            gap: 0.75rem;
        }
        .vero-modal-btn {
            flex: 1;
            padding: 0.875rem 1.5rem;
            border: none;
            border-radius: 12px;
            font-weight: 700;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
        }
        .vero-modal-btn:hover {
            transform: translateY(-1px);
        }
        .vero-modal-btn-primary {
            background: #a3e635;
            color: #0F172A;
        }
        .vero-modal-btn-primary:hover {
            background: #bef264;
        }
        .vero-modal-btn-danger {
            background: #EF4444;
            color: white;
        }
        .vero-modal-btn-danger:hover {
            background: #f87171;
        }
        .vero-modal-btn-cancel {
            background: rgba(255, 255, 255, 0.1);
            color: #94a3b8;
        }
        .vero-modal-btn-cancel:hover {
            background: rgba(255, 255, 255, 0.15);
            color: white;
        }
        .vero-modal-toast {
            position: fixed;
            top: 1.5rem;
            right: 1.5rem;
            background: #1E293B;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            padding: 1rem 1.5rem;
            color: #F8FAFC;
            font-weight: 600;
            font-size: 0.9rem;
            z-index: 10000;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
            transform: translateX(calc(100% + 2rem));
            transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            max-width: 360px;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .vero-modal-toast.vero-modal-visible {
            transform: translateX(0);
        }
    `;
    document.head.appendChild(style);

    // Inject root container (deferred if body not ready)
    let root;
    function ensureRoot() {
        if (root) return root;
        root = document.createElement('div');
        root.id = 'vero-modal-root';
        document.body.appendChild(root);
        return root;
    }
    if (document.body) {
        ensureRoot();
    } else {
        document.addEventListener('DOMContentLoaded', ensureRoot);
    }

    const TYPE_CONFIG = {
        success: { icon: '\u2705', color: '#a3e635' },
        error:   { icon: '\u274C', color: '#EF4444' },
        warning: { icon: '\u26A0\uFE0F', color: '#F59E0B' },
        info:    { icon: '\u2139\uFE0F', color: '#3b82f6' }
    };

    function getConfig(type) {
        return TYPE_CONFIG[type] || TYPE_CONFIG.info;
    }

    // Focus trap: keep Tab within modal
    function trapFocus(overlay) {
        function handler(e) {
            if (e.key !== 'Tab') return;
            const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
        overlay.addEventListener('keydown', handler);
        // Auto-focus first button
        requestAnimationFrame(() => {
            const first = overlay.querySelector('button');
            if (first) first.focus();
        });
        return handler;
    }

    function showModal(html) {
        const overlay = document.createElement('div');
        overlay.className = 'vero-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = html;
        ensureRoot().appendChild(overlay);

        // Trigger animation
        requestAnimationFrame(() => {
            overlay.classList.add('vero-modal-visible');
        });

        // Enable focus trap
        trapFocus(overlay);

        return overlay;
    }

    function closeModal(overlay) {
        overlay.classList.remove('vero-modal-visible');
        setTimeout(() => overlay.remove(), 200);
    }

    /**
     * Show an alert modal
     * @param {string} msg - Message to display
     * @param {object} opts - {type: 'success'|'error'|'warning'|'info', title: string}
     * @returns {Promise<void>}
     */
    function alert(msg, opts = {}) {
        const { type = 'info', title } = opts;
        const cfg = getConfig(type);

        return new Promise(resolve => {
            const html = `
                <div class="vero-modal-box">
                    <div class="vero-modal-icon">${cfg.icon}</div>
                    ${title ? `<div class="vero-modal-title">${_esc(title)}</div>` : ''}
                    <div class="vero-modal-msg">${_esc(msg)}</div>
                    <div class="vero-modal-actions">
                        <button class="vero-modal-btn vero-modal-btn-primary" data-action="ok">Aceptar</button>
                    </div>
                </div>
            `;

            const overlay = showModal(html);

            overlay.querySelector('[data-action="ok"]').addEventListener('click', () => {
                closeModal(overlay);
                resolve();
            });

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal(overlay);
                    resolve();
                }
            });
        });
    }

    /**
     * Show a confirm modal
     * @param {string} msg - Message to display
     * @param {object} opts - {type, title, confirmText, cancelText}
     * @returns {Promise<boolean>}
     */
    function confirm(msg, opts = {}) {
        const {
            type = 'warning',
            title,
            confirmText = 'Confirmar',
            cancelText = 'Cancelar'
        } = opts;
        const cfg = getConfig(type);
        const btnClass = type === 'error' ? 'vero-modal-btn-danger' : 'vero-modal-btn-primary';

        return new Promise(resolve => {
            const html = `
                <div class="vero-modal-box">
                    <div class="vero-modal-icon">${cfg.icon}</div>
                    ${title ? `<div class="vero-modal-title">${_esc(title)}</div>` : ''}
                    <div class="vero-modal-msg">${_esc(msg)}</div>
                    <div class="vero-modal-actions">
                        <button class="vero-modal-btn vero-modal-btn-cancel" data-action="cancel">${_esc(cancelText)}</button>
                        <button class="vero-modal-btn ${btnClass}" data-action="confirm">${_esc(confirmText)}</button>
                    </div>
                </div>
            `;

            const overlay = showModal(html);

            overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
                closeModal(overlay);
                resolve(true);
            });

            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
                closeModal(overlay);
                resolve(false);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal(overlay);
                    resolve(false);
                }
            });
        });
    }

    /**
     * Show a toast notification
     * @param {string} msg
     * @param {object} opts - {type, duration}
     */
    function toast(msg, opts = {}) {
        const { type = 'info', duration = 3500 } = opts;
        const cfg = getConfig(type);

        const el = document.createElement('div');
        el.className = 'vero-modal-toast';
        el.innerHTML = `<span>${cfg.icon}</span><span>${_esc(msg)}</span>`;
        ensureRoot().appendChild(el);

        requestAnimationFrame(() => {
            el.classList.add('vero-modal-visible');
        });

        setTimeout(() => {
            el.classList.remove('vero-modal-visible');
            setTimeout(() => el.remove(), 350);
        }, duration);
    }

    // Export global API
    window.veroModal = { alert, confirm, toast };
})();
