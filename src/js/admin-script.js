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
    const stage = document.getElementById('sticker-drop-zone');
    const stickerImage = document.getElementById('sticker-preview');
    const resizeHandle = document.getElementById('sticker-resize');
    const stickerInput = document.getElementById('sticker-file');
    const formFeedback = document.getElementById('form-feedback');
    const submitButton = document.getElementById('save-bubble');
    const stickerFeedback = document.getElementById('sticker-feedback');
    const defaultCss = 'background: linear-gradient(135deg, #182848, #4b6cb7); border: 2px solid #8fd3ff; border-radius: 16px; color: #ffffff; box-shadow: 0 0 12px #4b6cb7;';
    const allowedCssProperties = new Set([
        'background', 'background-color', 'background-image', 'backdrop-filter',
        'border', 'border-color', 'border-radius', 'border-style', 'border-width',
        'box-shadow', 'color', 'font-family', 'font-size', 'font-style',
        'font-weight', 'letter-spacing', 'line-height', 'text-shadow'
    ]);
    let editingBubbleId = null;
    let selectedStickerFile = null;
    let localStickerUrl = null;
    let stickerConfig = { image_url: '', x: 82, y: 50, size: 22, rotation: 0 };
    let pointerAction = null;
    let catalogBubbles = [];
    let activeCatalogFilter = 'all';

    function setStatus(message, kind = '') {
        status.textContent = message;
        status.className = `admin-status${kind ? ` ${kind}` : ''}`;
    }

    function setFormFeedback(message, isError = false) {
        formFeedback.textContent = message;
        formFeedback.classList.toggle('error', isError);
    }

    function validateCss(cssCode) {
        const prohibited = /url\s*\(|expression\s*\(|@import|javascript:|<\/style|behavior\s*:|-moz-binding|image-set\s*\(|image\s*\(|element\s*\(|paint\s*\(|cross-fade\s*\(|\/\*|\*\/|[\\<>{}\0]/i;
        if (typeof cssCode !== 'string' || cssCode.length > 12000 || prohibited.test(cssCode)) return false;
        return cssCode.split(';').every(declaration => {
            const trimmed = declaration.trim();
            if (!trimmed) return true;
            const match = trimmed.match(/^([a-z-]+)\s*:\s*(.+)$/i);
            return Boolean(match && allowedCssProperties.has(match[1].toLowerCase()));
        });
    }

    function applyBubbleCss(cssCode) {
        preview.removeAttribute('style');
        if (!validateCss(cssCode)) return false;
        for (const declaration of cssCode.split(';')) {
            const match = declaration.trim().match(/^([a-z-]+)\s*:\s*(.+)$/i);
            if (match) preview.style.setProperty(match[1].toLowerCase(), match[2].trim());
        }
        preview.querySelector('.bubble-preview-text').textContent = '¡Hola! Esta es mi nueva burbuja.';
        return true;
    }

    function currentCssDeclarations() {
        const declarations = new Map();
        for (const declaration of cssInput.value.split(';')) {
            const match = declaration.trim().match(/^([a-z-]+)\s*:\s*(.+)$/i);
            if (match && allowedCssProperties.has(match[1].toLowerCase())) {
                declarations.set(match[1].toLowerCase(), match[2].trim());
            }
        }
        return declarations;
    }

    function updateCssProperty(updates, removals = []) {
        const declarations = currentCssDeclarations();
        removals.forEach(property => declarations.delete(property));
        Object.entries(updates).forEach(([property, value]) => declarations.set(property, value));
        cssInput.value = [...declarations.entries()]
            .map(([property, value]) => `${property}: ${value};`)
            .join(' ');
        updatePreview();
    }

    function updatePreview() {
        const valid = applyBubbleCss(cssInput.value);
        if (!valid) {
            preview.style.opacity = '.45';
            preview.title = 'El CSS contiene propiedades no permitidas.';
            return false;
        }
        preview.style.opacity = '1';
        preview.title = '';
        return true;
    }

    function renderSticker() {
        const imageUrl = selectedStickerFile ? localStickerUrl : stickerConfig.image_url;
        const hasSticker = Boolean(imageUrl);
        stickerImage.hidden = !hasSticker;
        resizeHandle.hidden = !hasSticker;
        document.getElementById('remove-sticker').disabled = !hasSticker;
        if (!hasSticker) return;

        if (stickerImage.getAttribute('src') !== imageUrl) stickerImage.src = imageUrl;
        stickerImage.style.left = `${stickerConfig.x}%`;
        stickerImage.style.top = `${stickerConfig.y}%`;
        stickerImage.style.width = `${stickerConfig.size}%`;
        stickerImage.style.transform = `translate(-50%, -50%) rotate(${stickerConfig.rotation}deg)`;
        resizeHandle.style.left = `calc(${stickerConfig.x}% + ${stickerConfig.size / 2}%)`;
        resizeHandle.style.top = `calc(${stickerConfig.y}% + 36%)`;
        document.getElementById('sticker-size').value = String(stickerConfig.size);
        document.getElementById('sticker-size-value').value = `${stickerConfig.size}%`;
        document.getElementById('sticker-rotation').value = String(stickerConfig.rotation);
        document.getElementById('sticker-rotation-value').value = `${stickerConfig.rotation}°`;
    }

    function setStickerFile(file) {
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            stickerFeedback.textContent = 'Elige una imagen PNG, JPEG o WebP.';
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            stickerFeedback.textContent = 'La imagen supera el límite de 5 MB.';
            return;
        }
        if (localStickerUrl) URL.revokeObjectURL(localStickerUrl);
        selectedStickerFile = file;
        localStickerUrl = URL.createObjectURL(file);
        stickerConfig = { ...stickerConfig, x: 82, y: 50, size: 22, rotation: 0 };
        stickerFeedback.textContent = `${file.name} · muévelo por la zona derecha para no tapar el texto.`;
        renderSticker();
    }

    function setStickerConfig(config = {}) {
        const clamp = (value, min, max, fallback) =>
            Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
        stickerConfig = {
            image_url: typeof config.image_url === 'string' ? config.image_url : '',
            x: clamp(config.x, 77, 85, 82),
            y: clamp(config.y, 42, 58, 50),
            size: clamp(config.size, 8, 30, 22),
            rotation: clamp(config.rotation, -180, 180, 0)
        };
        renderSticker();
    }

    async function apiRequest(path, options = {}) {
        const response = await fetch(`${BACKEND_URL}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
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

    function enterEditMode(bubble) {
        editingBubbleId = bubble.item_id;
        document.getElementById('bubble-id').value = bubble.item_id;
        document.getElementById('bubble-id').disabled = true;
        document.getElementById('bubble-name').value = bubble.name || '';
        document.getElementById('bubble-icon').value = bubble.icon || '💬';
        document.getElementById('bubble-price').value = String(bubble.price ?? 0);
        document.getElementById('bubble-description').value = bubble.description || '';
        cssInput.value = bubble.css_code || '';
        const fontFamily = currentCssDeclarations().get('font-family') || '';
        document.getElementById('bubble-font').value = ['Minecraftia', 'MinecraftTen', 'Montserrat-Bold']
            .find(font => fontFamily.replace(/["']/g, '').split(',')[0].trim().toLowerCase() === font.toLowerCase()) || '';
        document.querySelector('#bubble-form .panel-heading h2').textContent = `Editar: ${bubble.name}`;
        document.querySelector('#bubble-form .admin-eyebrow').textContent = 'EDITANDO COSMÉTICO';
        submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
        document.getElementById('cancel-edit').hidden = false;
        selectedStickerFile = null;
        stickerInput.value = '';
        if (localStickerUrl) URL.revokeObjectURL(localStickerUrl);
        localStickerUrl = null;
        setStickerConfig(bubble.sticker_config);
        stickerFeedback.textContent = stickerConfig.image_url ? 'Arrastra el sticker por la zona derecha para dejar libre el texto.' : 'Sin sticker · colócalo en la zona derecha para dejar libre el texto.';
        updatePreview();
        setFormFeedback('');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function resetEditor() {
        editingBubbleId = null;
        selectedStickerFile = null;
        if (localStickerUrl) URL.revokeObjectURL(localStickerUrl);
        localStickerUrl = null;
        form.reset();
        document.getElementById('bubble-id').disabled = false;
        document.getElementById('bubble-icon').value = '💬';
        document.getElementById('bubble-price').value = '100';
        cssInput.value = defaultCss;
        document.getElementById('bubble-background').value = '#182848';
        document.getElementById('bubble-text-color').value = '#ffffff';
        document.getElementById('bubble-border-color').value = '#8fd3ff';
        document.getElementById('bubble-radius').value = '16';
        document.getElementById('bubble-radius-value').value = '16 px';
        document.getElementById('bubble-font').value = '';
        document.querySelector('#bubble-form .panel-heading h2').textContent = 'Crear burbuja';
        document.querySelector('#bubble-form .admin-eyebrow').textContent = 'NUEVO COSMÉTICO';
        submitButton.innerHTML = '<i class="fas fa-plus"></i> Crear burbuja';
        document.getElementById('cancel-edit').hidden = true;
        stickerInput.value = '';
        stickerFeedback.textContent = '';
        setStickerConfig({});
        updatePreview();
        setFormFeedback('');
    }

    function renderBubbles(items) {
        bubbleList.replaceChildren();
        catalogBubbles = items.filter(item => item.type === 'bubble');
        document.getElementById('bubble-count').textContent = String(catalogBubbles.length);
        const query = document.getElementById('bubble-search').value.trim().toLocaleLowerCase();
        document.getElementById('clear-bubble-search').hidden = !query;
        const bubbles = catalogBubbles.filter(bubble => {
            const matchesQuery = !query ||
                bubble.name.toLocaleLowerCase().includes(query) ||
                bubble.item_id.toLocaleLowerCase().includes(query);
            const matchesState = activeCatalogFilter === 'all' ||
                (activeCatalogFilter === 'enabled' && bubble.enabled) ||
                (activeCatalogFilter === 'disabled' && !bubble.enabled);
            return matchesQuery && matchesState;
        });

        if (!bubbles.length) {
            const empty = document.createElement('p');
            empty.className = 'bubble-empty';
            empty.textContent = catalogBubbles.length
                ? 'No hay burbujas que coincidan con la búsqueda o el filtro.'
                : 'Aún no hay burbujas en el catálogo.';
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
            const actions = document.createElement('div');
            actions.className = 'bubble-admin-actions';
            const edit = document.createElement('button');
            edit.className = 'bubble-edit-button';
            edit.type = 'button';
            edit.textContent = 'Editar';
            edit.addEventListener('click', () => enterEditMode(bubble));
            const toggle = document.createElement('button');
            toggle.className = 'bubble-toggle-button';
            toggle.type = 'button';
            toggle.textContent = bubble.enabled ? 'Desactivar' : 'Activar';
            toggle.setAttribute('aria-label', `${bubble.enabled ? 'Desactivar' : 'Activar'} ${bubble.name}`);
            toggle.addEventListener('click', () => toggleBubble(bubble, toggle));
            actions.append(edit, toggle);
            meta.append(state, actions);
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

    async function uploadSticker(itemId) {
        if (!selectedStickerFile) return;
        const data = new FormData();
        data.append('sticker', selectedStickerFile);
        const result = await apiRequest(`/api/admin/cosmetics/${encodeURIComponent(itemId)}/sticker`, {
            method: 'POST',
            body: data
        });
        stickerConfig = { ...stickerConfig, image_url: result.sticker_config.image_url };
        selectedStickerFile = null;
        if (localStickerUrl) URL.revokeObjectURL(localStickerUrl);
        localStickerUrl = null;
        renderSticker();
    }

    function getBubblePayload() {
        return {
            name: document.getElementById('bubble-name').value.trim(),
            icon: document.getElementById('bubble-icon').value.trim(),
            price: Number(document.getElementById('bubble-price').value),
            description: document.getElementById('bubble-description').value.trim(),
            css_code: cssInput.value.trim(),
            sticker_config: stickerConfig.image_url ? { ...stickerConfig } : {}
        };
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        setFormFeedback('');
        if (!form.reportValidity()) return;
        if (!updatePreview()) {
            setFormFeedback('Revisa el CSS: usa solo propiedades visuales permitidas, sin URLs, selectores ni llaves.', true);
            return;
        }

        submitButton.disabled = true;
        try {
            if (!editingBubbleId) {
                const created = await apiRequest('/api/admin/cosmetics', {
                    method: 'POST',
                    body: JSON.stringify({
                        ...getBubblePayload(),
                        item_id: document.getElementById('bubble-id').value.trim(),
                        type: 'bubble',
                        sticker_config: {}
                    })
                });
                editingBubbleId = created.item_id;
                document.getElementById('bubble-id').disabled = true;
                document.querySelector('#bubble-form .panel-heading h2').textContent = `Editar: ${created.name}`;
                document.querySelector('#bubble-form .admin-eyebrow').textContent = 'EDITANDO COSMÉTICO';
                submitButton.innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
                document.getElementById('cancel-edit').hidden = false;
            }

            await uploadSticker(editingBubbleId);
            await apiRequest(`/api/admin/cosmetics/${encodeURIComponent(editingBubbleId)}`, {
                method: 'PUT',
                body: JSON.stringify(getBubblePayload())
            });
            await loadBubbles();
            resetEditor();
            setFormFeedback('Burbuja guardada. El sticker ya está disponible en web y launcher.');
        } catch (error) {
            setFormFeedback(error.message || 'No se pudo guardar la burbuja.', true);
            showRequestError(error);
            if (editingBubbleId) await loadBubbles();
        } finally {
            submitButton.disabled = false;
        }
    });

    document.getElementById('cancel-edit').addEventListener('click', resetEditor);
    document.getElementById('refresh-bubbles').addEventListener('click', loadBubbles);
    cssInput.addEventListener('input', updatePreview);
    document.getElementById('bubble-search').addEventListener('input', () => renderBubbles(catalogBubbles));
    document.getElementById('clear-bubble-search').addEventListener('click', () => {
        document.getElementById('bubble-search').value = '';
        document.getElementById('bubble-search').focus();
        renderBubbles(catalogBubbles);
    });
    document.querySelectorAll('.catalog-filter').forEach(button => {
        button.addEventListener('click', () => {
            activeCatalogFilter = button.dataset.filter;
            document.querySelectorAll('.catalog-filter').forEach(filterButton => {
                const isActive = filterButton === button;
                filterButton.classList.toggle('active', isActive);
                filterButton.setAttribute('aria-pressed', String(isActive));
            });
            renderBubbles(catalogBubbles);
        });
    });
    stickerInput.addEventListener('change', () => setStickerFile(stickerInput.files[0]));
    document.getElementById('remove-sticker').addEventListener('click', () => {
        selectedStickerFile = null;
        if (localStickerUrl) URL.revokeObjectURL(localStickerUrl);
        localStickerUrl = null;
        setStickerConfig({});
        stickerInput.value = '';
        stickerFeedback.textContent = 'El sticker se quitará al guardar los cambios.';
    });

    document.getElementById('bubble-background').addEventListener('input', event => {
        updateCssProperty({ 'background-color': event.target.value }, ['background', 'background-image']);
    });
    document.getElementById('bubble-text-color').addEventListener('input', event => {
        updateCssProperty({ color: event.target.value });
    });
    document.getElementById('bubble-border-color').addEventListener('input', event => {
        updateCssProperty({ border: `2px solid ${event.target.value}` }, ['border-color', 'border-style', 'border-width']);
    });
    document.getElementById('bubble-radius').addEventListener('input', event => {
        const radius = Number(event.target.value);
        document.getElementById('bubble-radius-value').value = `${radius} px`;
        updateCssProperty({ 'border-radius': `${radius}px` });
    });
    document.getElementById('bubble-font').addEventListener('change', event => {
        const family = event.target.value;
        if (family) updateCssProperty({ 'font-family': `"${family}", sans-serif` });
        else updateCssProperty({}, ['font-family']);
    });
    document.getElementById('sticker-size').addEventListener('input', event => {
        stickerConfig.size = Math.min(30, Number(event.target.value));
        document.getElementById('sticker-size-value').value = `${stickerConfig.size}%`;
        renderSticker();
    });
    document.getElementById('sticker-rotation').addEventListener('input', event => {
        stickerConfig.rotation = Number(event.target.value);
        document.getElementById('sticker-rotation-value').value = `${stickerConfig.rotation}°`;
        renderSticker();
    });

    stickerImage.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        stickerImage.setPointerCapture(event.pointerId);
        pointerAction = { pointerId: event.pointerId, type: 'move' };
    });
    resizeHandle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        resizeHandle.setPointerCapture(event.pointerId);
        pointerAction = { pointerId: event.pointerId, type: 'resize', startSize: stickerConfig.size, startX: event.clientX, startY: event.clientY };
    });
    stage.addEventListener('pointermove', event => {
        if (!pointerAction || event.pointerId !== pointerAction.pointerId) return;
        const bounds = preview.getBoundingClientRect();
        if (pointerAction.type === 'move') {
            stickerConfig.x = Math.max(77, Math.min(85, ((event.clientX - bounds.left) / bounds.width) * 100));
            stickerConfig.y = Math.max(42, Math.min(58, ((event.clientY - bounds.top) / bounds.height) * 100));
        } else {
            const delta = event.clientX - pointerAction.startX + event.clientY - pointerAction.startY;
            stickerConfig.size = Math.max(8, Math.min(30, pointerAction.startSize + (delta / bounds.width) * 100));
            document.getElementById('sticker-size-value').value = `${Math.round(stickerConfig.size)}%`;
        }
        renderSticker();
    });
    for (const target of [stickerImage, resizeHandle]) {
        target.addEventListener('pointerup', () => { pointerAction = null; });
        target.addEventListener('pointercancel', () => { pointerAction = null; });
    }

    stage.addEventListener('dragover', event => {
        event.preventDefault();
        stage.classList.add('drag-over');
    });
    stage.addEventListener('dragleave', event => {
        if (!stage.contains(event.relatedTarget)) stage.classList.remove('drag-over');
    });
    stage.addEventListener('drop', event => {
        event.preventDefault();
        stage.classList.remove('drag-over');
        setStickerFile(event.dataTransfer.files[0]);
    });

    if (!token) {
        window.location.href = 'login.html?error=auth_required';
        return;
    }
    updatePreview();
    setStickerConfig({});
    loadBubbles();
});
