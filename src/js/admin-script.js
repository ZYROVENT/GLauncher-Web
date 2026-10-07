document.addEventListener('DOMContentLoaded', () => {
    const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : 'https://glauncher-api.onrender.com';
    const token = localStorage.getItem('glauncher_token');
    const status = document.getElementById('admin-status');
    const workspace = document.getElementById('admin-workspace');
    const form = document.getElementById('bubble-form');
    const bubbleList = document.getElementById('bubble-list');
    const cssInput = document.getElementById('bubble-css');
    const preview = document.getElementById('bubble-preview');
    const formFeedback = document.getElementById('form-feedback');
    const submitButton = form.querySelector('[type="submit"]');
    const allowedCssProperties = new Set([
        'background', 'background-color', 'background-image', 'backdrop-filter',
        'border', 'border-color', 'border-radius', 'border-style', 'border-width',
        'box-shadow', 'color', 'font-family', 'font-size', 'font-style',
        'font-weight', 'letter-spacing', 'line-height', 'text-shadow'
    ]);

    function setStatus(message, kind = '') {
        status.textContent = message;
        status.className = `admin-status${kind ? ` ${kind}` : ''}`;
    }

    function setFormFeedback(message, isError = false) {
        formFeedback.textContent = message;
        formFeedback.classList.toggle('error', isError);
    }

    function bubbleStyle(cssCode, element) {
        element.removeAttribute('style');
        const prohibited = /url\s*\(|expression\s*\(|@import|javascript:|<\/style|behavior\s*:|-moz-binding|image-set\s*\(|image\s*\(|element\s*\(|paint\s*\(|cross-fade\s*\(|\/\*|\*\/|[\\<>{}\0]/i;
        if (typeof cssCode !== 'string' || cssCode.length > 12000 || prohibited.test(cssCode)) return false;

        for (const declaration of cssCode.split(';')) {
            const trimmed = declaration.trim();
            if (!trimmed) continue;
            const match = trimmed.match(/^([a-z-]+)\s*:\s*(.+)$/i);
            if (!match || !allowedCssProperties.has(match[1].toLowerCase())) return false;
            element.style.setProperty(match[1].toLowerCase(), match[2].trim());
        }
        return true;
    }

    function updatePreview() {
        const cssCode = cssInput.value;
        const valid = bubbleStyle(cssCode, preview);
        preview.textContent = '¡Hola! Esta es mi nueva burbuja.';
        preview.style.opacity = valid ? '1' : '.45';
        preview.title = valid ? '' : 'El estilo contiene propiedades no permitidas.';
    }

    async function apiRequest(path, options = {}) {
        const response = await fetch(`${BACKEND_URL}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers
            }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(result.message || result.error || `Error ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return result;
    }

    function showRequestError(error) {
        if (error.status === 401) {
            localStorage.removeItem('glauncher_token');
            window.location.href = 'login.html?error=session_expired';
            return;
        }
        if (error.status === 403) {
            workspace.hidden = true;
            setStatus('Tu cuenta no tiene permisos de administrador para gestionar este catálogo.', 'error');
            return;
        }
        setStatus(error.message || 'No se pudo completar la solicitud.', 'error');
    }

    function renderBubbles(items) {
        bubbleList.replaceChildren();
        const bubbles = items.filter(item => item.type === 'bubble');
        document.getElementById('bubble-count').textContent = String(bubbles.length);

        if (!bubbles.length) {
            const empty = document.createElement('p');
            empty.className = 'bubble-empty';
            empty.textContent = 'Aún no hay burbujas en el catálogo.';
            bubbleList.append(empty);
            return;
        }

        for (const bubble of bubbles) {
            const card = document.createElement('article');
            card.className = 'bubble-admin-card';

            const icon = document.createElement('span');
            icon.className = 'bubble-admin-icon';
            icon.textContent = bubble.icon;

            const details = document.createElement('div');
            details.className = 'bubble-admin-details';
            const name = document.createElement('strong');
            name.textContent = bubble.name;
            const id = document.createElement('code');
            id.textContent = bubble.item_id;
            details.append(name, id);

            const meta = document.createElement('div');
            meta.className = 'bubble-admin-meta';
            const state = document.createElement('span');
            state.className = `bubble-state${bubble.enabled ? ' enabled' : ''}`;
            state.textContent = bubble.enabled ? `Activa · ${bubble.price} GCoins` : 'Desactivada';
            const toggle = document.createElement('button');
            toggle.className = 'bubble-toggle-button';
            toggle.type = 'button';
            toggle.textContent = bubble.enabled ? 'Desactivar' : 'Activar';
            toggle.setAttribute('aria-label', `${bubble.enabled ? 'Desactivar' : 'Activar'} ${bubble.name}`);
            toggle.addEventListener('click', () => toggleBubble(bubble, toggle));
            meta.append(state, toggle);
            card.append(icon, details, meta);
            bubbleList.append(card);
        }
    }

    async function loadBubbles() {
        const refreshButton = document.getElementById('refresh-bubbles');
        refreshButton.disabled = true;
        setStatus('Cargando catálogo de burbujas…');
        try {
            const items = await apiRequest('/api/admin/cosmetics');
            renderBubbles(Array.isArray(items) ? items : []);
            workspace.hidden = false;
            setStatus('Permisos verificados. Los cambios se guardan en el catálogo compartido.', 'success');
        } catch (error) {
            showRequestError(error);
        } finally {
            refreshButton.disabled = false;
        }
    }

    async function toggleBubble(bubble, button) {
        button.disabled = true;
        try {
            await apiRequest(`/api/admin/cosmetics/${encodeURIComponent(bubble.item_id)}`, {
                method: 'PUT',
                body: JSON.stringify({ enabled: !bubble.enabled })
            });
            await loadBubbles();
        } catch (error) {
            showRequestError(error);
            button.disabled = false;
        }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        setFormFeedback('');
        if (!form.reportValidity()) return;

        const cssCode = cssInput.value.trim();
        const isSafeCss = bubbleStyle(cssCode, preview);
        if (!isSafeCss) {
            setFormFeedback('Revisa el CSS: usa solo propiedades visuales permitidas, sin URLs, selectores ni llaves.', true);
            return;
        }

        const payload = {
            item_id: document.getElementById('bubble-id').value.trim(),
            name: document.getElementById('bubble-name').value.trim(),
            type: 'bubble',
            price: Number(document.getElementById('bubble-price').value),
            icon: document.getElementById('bubble-icon').value.trim(),
            description: document.getElementById('bubble-description').value.trim(),
            css_code: cssCode
        };

        submitButton.disabled = true;
        try {
            await apiRequest('/api/admin/cosmetics', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            form.reset();
            document.getElementById('bubble-icon').value = '💬';
            document.getElementById('bubble-price').value = '100';
            cssInput.value = 'background: linear-gradient(135deg, #182848, #4b6cb7); border: 2px solid #8fd3ff; border-radius: 16px; color: #ffffff; box-shadow: 0 0 12px #4b6cb7;';
            updatePreview();
            setFormFeedback('Burbuja creada y guardada en el catálogo.');
            await loadBubbles();
        } catch (error) {
            setFormFeedback(error.message || 'No se pudo crear la burbuja.', true);
        } finally {
            submitButton.disabled = false;
        }
    });

    cssInput.addEventListener('input', updatePreview);
    document.getElementById('refresh-bubbles').addEventListener('click', loadBubbles);

    if (!token) {
        window.location.href = 'login.html?error=auth_required';
        return;
    }
    updatePreview();
    loadBubbles();
});
