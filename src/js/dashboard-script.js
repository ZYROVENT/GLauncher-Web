document.addEventListener('DOMContentLoaded', () => {
    const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : 'https://glauncher-api.onrender.com';
    const DEFAULT_AVATAR_URL = '../assets/images/avatars/default-avatar.png';
    const PUSHER_KEY = 'a2fb8d4323a44da53c63';
    const GIPHY_KEY = '1At7olUkhbz0QZOZCPdbbpYngyLOe3CS';
    const token = localStorage.getItem('glauncher_token');
    let realtimePusher = null;
    let currentProgression = null;
    let currentDashboardUserData = null;
    let currentCosmeticInventory = { items: [], equipped: {} };
    let cosmeticCatalog = [];

    // --- INICIALIZAR NAVEGACIÓN POR PESTAÑAS ---
    if (window.initializeTabNavigation) {
        window.initializeTabNavigation('.floating-nav-item', '.content-section');
    }
    document.getElementById('admin-nav-button')?.addEventListener('click', () => { window.location.href = 'admin.html'; });

    // --- VERIFICACIÓN DE AUTENTICACIÓN ---
    if (!token) {
        window.location.href = 'login.html?error=auth_required';
        return;
    }

    // Función para decodificar JWT sin librerías externas
    function parseJwt(tokenStr) {
        try {
            const base64Url = tokenStr.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            return null;
        }
    }

    const decodedToken = parseJwt(token) || {};

    // --- CARGA DE DATOS DE USUARIO ---
    async function loadUserData() {
        const headers = { 'Authorization': `Bearer ${token}` };
        let userData = {
            id: decodedToken.id || 1,
            username: decodedToken.username || 'Usuario',
            role: decodedToken.role || 'Jugador',
            is_admin: decodedToken.is_admin || (decodedToken.role === 'admin'),
            gcoins: 100,
            play_time_seconds: 0,
            status: 'Disponible',
            avatar_url: DEFAULT_AVATAR_URL,
            owned_cosmetics: []
        };

        try {
            // 1. Cargar información de usuario desde API
            const userResponse = await fetch(`${BACKEND_URL}/api/user_info`, { headers });

            if (userResponse.ok) {
                const fetchedData = await userResponse.json();
                userData = { ...userData, ...fetchedData };
            } else if (userResponse.status === 401) {
                localStorage.removeItem('glauncher_token');
                window.location.href = 'login.html?error=session_expired';
                return;
            } else {
                console.warn(`Aviso: La API respondió con código ${userResponse.status}. Usando datos de sesión locales.`);
            }

            userData.owned_cosmetics = userData.owned_cosmetics || [];
            currentDashboardUserData = userData;

            let progressionData = null;
            try {
                const progressionResponse = await fetch(`${BACKEND_URL}/api/progression/me`, { headers });
                if (!progressionResponse.ok) {
                    const result = await progressionResponse.json().catch(() => ({}));
                    throw new Error(result.message || `Error ${progressionResponse.status}`);
                }
                progressionData = await progressionResponse.json();
            } catch (progressionError) {
                console.warn('No se pudo cargar el progreso de nivel:', progressionError);
            }

            let catalogData = [];
            let inventoryData = { items: [], equipped: {} };
            let cosmeticsLoadError = null;
            try {
                const [catalogResponse, inventoryResponse] = await Promise.all([
                    fetch(`${BACKEND_URL}/api/shop/cosmetics`, { headers }),
                    fetch(`${BACKEND_URL}/api/cosmetics/me`, { headers })
                ]);
                if (!catalogResponse.ok) throw new Error(`Error de catálogo ${catalogResponse.status}`);
                if (!inventoryResponse.ok) throw new Error(`Error de inventario ${inventoryResponse.status}`);
                catalogData = await catalogResponse.json();
                inventoryData = await inventoryResponse.json();
            } catch (cosmeticsError) {
                cosmeticsLoadError = cosmeticsError;
                console.warn('No se pudo cargar el catálogo o inventario de cosméticos:', cosmeticsError);
            }

            // 2. Cargar amigos de forma no bloqueante
            let friendsData = { friends: [], pending: [], sent: [] };
            try {
                const friendsResponse = await fetch(`${BACKEND_URL}/api/friends`, { headers });
                if (friendsResponse.ok) {
                    friendsData = await friendsResponse.json();
                }
            } catch (fErr) {
                console.warn("Aviso al consultar amigos:", fErr);
            }

            // 3. Inicializar Pusher en tiempo real
            if (typeof Pusher !== 'undefined') {
                try {
                    initializeRealtimeNotifications(userData, friendsData);
                } catch (pErr) {
                    console.warn("Aviso al conectar Pusher:", pErr);
                }
            }

            // 4. Inicializar componentes del Dashboard
            populateSidebar(userData);
            populateStats(userData);
            renderPlayerProgression(progressionData);
            cosmeticCatalog = Array.isArray(catalogData) ? catalogData : [];
            currentCosmeticInventory = inventoryData;
            renderCosmeticsInventory(cosmeticsLoadError);
            renderFriendsList(friendsData);
            setupFriendSearch(userData, friendsData);
            initializeSettings(userData);
            initializeAchievements(userData);
            initializeStatusSystem(userData);
            initializeGChat(userData, friendsData);

        } catch (error) {
            console.warn("Modo local/desconectado activo:", error);
            populateSidebar(userData);
            populateStats(userData);
            renderPlayerProgression(null);
            renderCosmeticsInventory(new Error('No se pudo conectar con el inventario de cosméticos.'));
            renderFriendsList({ friends: [], pending: [], sent: [] });
            setupFriendSearch(userData, { friends: [], pending: [], sent: [] });
            initializeSettings(userData);
            initializeAchievements(userData);
            initializeStatusSystem(userData);
            initializeGChat(userData, { friends: [], pending: [], sent: [] });
        }
    }

    // --- POBLAR BARRA LATERAL ---
    function populateSidebar(userData) {
        const navAvatar = document.getElementById('nav-avatar');
        const navUsername = document.getElementById('nav-username');
        const userRole = document.getElementById('user-role');
        const userRoleContainer = document.getElementById('user-role-container');

        if (navAvatar) setAvatarSource(navAvatar, userData.avatar_url || userData.profile_picture_url);
        if (navUsername) navUsername.textContent = userData.username || 'Usuario';
        if (userRole) userRole.textContent = userData.role || 'Jugador';
        if (userRoleContainer) userRoleContainer.style.display = 'block';

        if (userData.is_admin) {
            const adminBtn = document.getElementById('admin-nav-button');
            if (adminBtn) adminBtn.style.display = 'flex';
        }

        // Botón Cerrar Sesión
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            localStorage.removeItem('glauncher_token');
            window.showNotification('Has cerrado sesión.', 'success');
            setTimeout(() => window.location.href = '../../index.html', 1500);
        });

        // --- LÓGICA PARA INICIAR GLAUNCHER.EXE ---
        const launchBtn = document.getElementById('launch-game-btn');
        const launchModal = document.getElementById('launch-fallback-modal');
        const closeLaunchModalBtn = document.getElementById('close-launch-modal');
        const cancelLaunchModalBtn = document.getElementById('cancel-launch-modal');

        const closeModal = () => {
            if (launchModal) launchModal.classList.remove('visible');
        };

        if (closeLaunchModalBtn) closeLaunchModalBtn.addEventListener('click', closeModal);
        if (cancelLaunchModalBtn) cancelLaunchModalBtn.addEventListener('click', closeModal);
        if (launchModal) {
            launchModal.addEventListener('click', (e) => {
                if (e.target === launchModal) closeModal();
            });
        }

        if (launchBtn) {
            launchBtn.addEventListener('click', () => {
                window.showNotification('🚀 Ejecutando GLauncher.exe...', 'info');

                const userParam = encodeURIComponent(userData.username || '');
                const tokenParam = encodeURIComponent(token || '');
                const protocolUri = `glauncher://launch?user=${userParam}&token=${tokenParam}`;

                // Intentar abrir vía iframe
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = protocolUri;
                document.body.appendChild(iframe);
                setTimeout(() => iframe.remove(), 2000);

                // Alternativa directa
                window.location.href = protocolUri;

                // Modal de ayuda si no se detecta la app
                setTimeout(() => {
                    if (launchModal) launchModal.classList.add('visible');
                }, 2500);
            });
        }
    }

    function setAvatarSource(image, source) {
        if (!image) return;
        image.onerror = () => {
            image.onerror = null;
            image.src = DEFAULT_AVATAR_URL;
        };
        image.src = source || DEFAULT_AVATAR_URL;
    }

    // --- POBLAR ESTADÍSTICAS ---
    function populateStats(userData) {
        const gcoinsEl = document.getElementById('stat-gcoins');
        const cosmeticsEl = document.getElementById('stat-cosmetics');
        const registerDateEl = document.getElementById('stat-register-date');
        const playtimeEl = document.getElementById('stat-playtime');

        if (gcoinsEl) gcoinsEl.textContent = (userData.gcoins || 0).toLocaleString('es-ES');
        if (cosmeticsEl) cosmeticsEl.textContent = (userData.owned_cosmetics || []).length;
        if (registerDateEl) registerDateEl.textContent = new Date(userData.created_at || Date.now()).toLocaleDateString('es-ES');
        if (playtimeEl) playtimeEl.textContent = `${Math.floor((userData.play_time_seconds || 0) / 3600)}h`;
    }

    function renderPlayerProgression(progression) {
        const levelLabel = document.getElementById('player-level');
        const rankLabel = document.getElementById('player-rank');
        const xpLabel = document.getElementById('player-xp-label');
        const xpFill = document.getElementById('player-xp-fill');
        const progressTrack = document.querySelector('.player-progression-track');
        const rewardPanel = document.getElementById('level-reward-panel');
        const rewardTitle = document.getElementById('level-reward-title');
        const rewardDescription = document.getElementById('level-reward-description');
        const rewardSelect = document.getElementById('level-reward-item');
        const claimButton = document.getElementById('claim-level-reward');
        const rewardStatus = document.getElementById('level-reward-status');
        if (!levelLabel || !rankLabel || !xpLabel || !xpFill || !rewardPanel || !rewardSelect || !claimButton) return;

        currentProgression = progression;
        if (!progression) {
            levelLabel.textContent = 'Nivel no disponible';
            rankLabel.textContent = 'Sin sincronizar';
            xpLabel.textContent = 'No se pudo cargar el progreso de la cuenta.';
            xpFill.style.width = '0%';
            if (progressTrack) progressTrack.setAttribute('aria-valuenow', '0');
            rewardPanel.hidden = true;
            return;
        }

        const xpInLevel = Math.max(0, Math.min(99, Number(progression.xp_in_level) || 0));
        const pendingRewards = Array.isArray(progression.pending_rewards) ? progression.pending_rewards : [];
        const ownedCosmetics = new Set(Array.isArray(progression.owned_cosmetics) ? progression.owned_cosmetics : []);
        const availableCosmetics = cosmeticCatalog.filter(item => !ownedCosmetics.has(item.item_id));
        levelLabel.textContent = `Nivel ${Number(progression.level) || 1}`;
        rankLabel.textContent = progression.rank || 'JUGADOR GLOBAL';
        xpLabel.textContent = `${xpInLevel} / 100 XP para el siguiente nivel`;
        xpFill.style.width = `${xpInLevel}%`;
        if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(xpInLevel));

        rewardPanel.hidden = pendingRewards.length === 0;
        rewardSelect.replaceChildren();
        if (rewardStatus) rewardStatus.textContent = '';
        if (pendingRewards.length) {
            rewardTitle.textContent = `Recompensa disponible · Nivel ${pendingRewards[0]}`;
            rewardDescription.textContent = pendingRewards.length > 1
                ? `Tienes ${pendingRewards.length} recompensas pendientes. Escoge un cosmético por recompensa.`
                : 'Escoge un cosmético disponible de la tienda; no se descontarán GCoins.';
            availableCosmetics.forEach(item => {
                const option = document.createElement('option');
                option.value = item.item_id;
                option.textContent = item.name;
                rewardSelect.appendChild(option);
            });
            if (!availableCosmetics.length) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Ya tienes todos los cosméticos disponibles';
                rewardSelect.appendChild(option);
            }
        }
        rewardSelect.disabled = availableCosmetics.length === 0;
        claimButton.disabled = availableCosmetics.length === 0 || pendingRewards.length === 0;
        claimButton.onclick = claimWebLevelReward;
    }

    function applyCosmeticCss(element, cssCode) {
        if (!element || typeof cssCode !== 'string' || !cssCode.trim()) return;
        if (/url\s*\(|expression\s*\(|@import|javascript:|<\/style|behavior\s*:|-moz-binding|image-set\s*\(|image\s*\(|element\s*\(|paint\s*\(|cross-fade\s*\(|\/\*|\*\/|\\/i.test(cssCode)) return;
        const allowedProperties = new Set([
            'background', 'background-color', 'background-image', 'backdrop-filter',
            'border', 'border-color', 'border-radius', 'border-style', 'border-width',
            'box-shadow', 'color', 'font-family', 'font-size', 'font-style',
            'font-weight', 'letter-spacing', 'line-height', 'text-shadow'
        ]);
        const declarations = document.createElement('span').style;
        declarations.cssText = cssCode;
        for (let index = 0; index < declarations.length; index += 1) {
            const property = declarations[index];
            if (allowedProperties.has(property)) {
                element.style.setProperty(property, declarations.getPropertyValue(property));
            }
        }
    }

    function addBubbleSticker(container, config) {
        container.querySelector('.gchat-bubble-sticker')?.remove();
        if (!config || typeof config.image_url !== 'string') return;
        try {
            const imageUrl = new URL(config.image_url);
            const storageOrigin = typeof SUPABASE_URL === 'string'
                ? new URL(SUPABASE_URL).origin
                : 'https://ouqpeojilykkrmatijxp.supabase.co';
            if (imageUrl.protocol !== 'https:' || imageUrl.origin !== storageOrigin ||
                !/^\/storage\/v1\/object\/public\/cosmetic-stickers\/[a-z0-9][a-z0-9_-]{1,63}\.webp$/.test(imageUrl.pathname)) return;

            const image = document.createElement('img');
            image.className = 'gchat-bubble-sticker';
            image.src = imageUrl.href;
            image.alt = '';
            image.setAttribute('aria-hidden', 'true');
            image.loading = 'lazy';
            image.referrerPolicy = 'no-referrer';
            const clamp = (value, min, max, fallback) =>
                Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
            container.style.position = 'relative';
            Object.assign(image.style, {
                position: 'absolute',
                zIndex: '2',
                pointerEvents: 'none',
                maxWidth: 'none',
                maxHeight: 'none',
                objectFit: 'contain',
                left: `${clamp(config.x, 0, 100, 78)}%`,
                top: `${clamp(config.y, 0, 100, 24)}%`,
                width: `${clamp(config.size, 8, 60, 26)}%`,
                transform: `translate(-50%, -50%) rotate(${clamp(config.rotation, -180, 180, 0)}deg)`
            });
            container.append(image);
        } catch (error) {
            console.warn('[Cosmetics] Sticker URL no válida:', error);
        }
    }

    function applyEquippedBubble(message) {
        const bubbleId = currentCosmeticInventory.equipped?.bubble;
        const bubble = currentCosmeticInventory.items?.find(item => item.item_id === bubbleId && item.type === 'bubble');
        if (!message) return;
        const cosmeticProperties = [
            'background', 'background-color', 'background-image', 'backdrop-filter',
            'border', 'border-color', 'border-radius', 'border-style', 'border-width',
            'box-shadow', 'color', 'font-family', 'font-size', 'font-style',
            'font-weight', 'letter-spacing', 'line-height', 'text-shadow'
        ];
        cosmeticProperties.forEach(property => message.style.removeProperty(property));
        message.querySelector('.gchat-bubble-sticker')?.remove();
        const text = message.querySelector('p');
        if (!bubble) {
            if (text) cosmeticProperties.forEach(property => text.style.removeProperty(property));
            return;
        }
        applyCosmeticCss(message, bubble.css_code);
        if (!text) return;
        const declarations = document.createElement('span').style;
        declarations.cssText = bubble.css_code || '';
        ['color', 'font-family', 'font-size', 'font-style', 'font-weight', 'letter-spacing', 'line-height', 'text-shadow']
            .forEach(property => {
                const value = declarations.getPropertyValue(property);
                if (value) text.style.setProperty(property, value);
                else text.style.removeProperty(property);
            });
        addBubbleSticker(text, bubble.sticker_config);
    }

    function refreshEquippedBubbles() {
        document.querySelectorAll('.gchat-message.sent').forEach(applyEquippedBubble);
    }

    function renderCosmeticsInventory(error = null) {
        const grid = document.getElementById('cosmetics-inventory-grid');
        const count = document.getElementById('cosmetics-inventory-count');
        if (!grid) return;
        const items = Array.isArray(currentCosmeticInventory.items) ? currentCosmeticInventory.items : [];
        if (count) count.textContent = `${items.length} ${items.length === 1 ? 'objeto' : 'objetos'}`;
        grid.replaceChildren();
        if (error) {
            const failure = document.createElement('p');
            failure.className = 'placeholder-content';
            failure.textContent = error.message;
            grid.appendChild(failure);
            return;
        }
        if (!items.length) {
            const empty = document.createElement('p');
            empty.className = 'placeholder-content';
            empty.textContent = 'Aún no tienes cosméticos. Consigue uno en la tienda o al subir de nivel.';
            grid.appendChild(empty);
            return;
        }

        items.forEach(item => {
            const card = document.createElement('article');
            card.className = `cosmetic-inventory-item${item.equipped ? ' equipped' : ''}`;
            const preview = document.createElement('div');
            preview.className = 'cosmetic-inventory-preview';
            preview.textContent = item.type === 'bubble' ? 'Vista previa de tu mensaje' : (item.icon || '✦');
            if (item.type === 'bubble') {
                applyCosmeticCss(preview, item.css_code);
                addBubbleSticker(preview, item.sticker_config);
            }
            const info = document.createElement('div');
            info.className = 'cosmetic-inventory-info';
            const name = document.createElement('strong');
            name.textContent = item.name || item.item_id;
            const type = document.createElement('span');
            type.textContent = item.type;
            info.append(name, type);
            const button = document.createElement('button');
            button.className = 'action-btn save-btn';
            button.type = 'button';
            button.textContent = item.equipped
                ? 'Quitar'
                : item.enabled === false ? 'Retirado' : 'Equipar';
            button.disabled = item.enabled === false && !item.equipped;
            if (!button.disabled) button.addEventListener('click', () => setCosmeticEquipped(item));
            card.append(preview, info, button);
            grid.appendChild(card);
        });
    }

    async function setCosmeticEquipped(item) {
        const equip = !item.equipped;
        try {
            const response = await fetch(`${BACKEND_URL}/api/cosmetics/equip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ type: item.type, item_id: equip ? item.item_id : null })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `Error ${response.status}`);
            currentCosmeticInventory.equipped = {
                ...currentCosmeticInventory.equipped,
                [item.type]: equip ? item.item_id : null
            };
            currentCosmeticInventory.items = currentCosmeticInventory.items.map(cosmetic => ({
                ...cosmetic,
                equipped: equip ? cosmetic.item_id === item.item_id : (
                    cosmetic.type === item.type ? false : cosmetic.equipped
                )
            }));
            renderCosmeticsInventory();
            refreshEquippedBubbles();
            if (window.showNotification) {
                window.showNotification(equip ? `${item.name} equipado.` : `${item.name} quitado.`, 'success');
            }
        } catch (error) {
            if (window.showNotification) window.showNotification(error.message, 'error');
        }
    }

    async function claimWebLevelReward() {
        if (!currentProgression || !Array.isArray(currentProgression.pending_rewards)) return;
        const level = currentProgression.pending_rewards[0];
        const itemId = document.getElementById('level-reward-item')?.value;
        const claimButton = document.getElementById('claim-level-reward');
        const rewardStatus = document.getElementById('level-reward-status');
        if (!level || !itemId || !claimButton) return;

        claimButton.disabled = true;
        if (rewardStatus) rewardStatus.textContent = 'Reclamando recompensa...';
        let claimed = false;
        try {
            const response = await fetch(`${BACKEND_URL}/api/progression/rewards/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ level, item_id: itemId })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || `Error ${response.status}`);
            claimed = true;

            currentDashboardUserData.owned_cosmetics = [
                ...new Set([...(currentDashboardUserData.owned_cosmetics || []), itemId])
            ];
            populateStats(currentDashboardUserData);
            const catalogItem = cosmeticCatalog.find(item => item.item_id === itemId);
            if (catalogItem) {
                currentCosmeticInventory.items.push({
                    ...catalogItem,
                    source: 'level_reward',
                    equipped: false
                });
            }
            renderCosmeticsInventory();
            const progressionResponse = await fetch(`${BACKEND_URL}/api/progression/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!progressionResponse.ok) {
                const progressionError = await progressionResponse.json().catch(() => ({}));
                throw new Error(progressionError.message || `Error ${progressionResponse.status}`);
            }
            renderPlayerProgression(await progressionResponse.json());
            if (window.showNotification) window.showNotification('¡Cosmético reclamado gratis!', 'success');
        } catch (error) {
            const message = claimed
                ? `La recompensa se reclamó, pero no se pudo actualizar el progreso: ${error.message}`
                : error.message;
            if (rewardStatus) rewardStatus.textContent = message;
            if (window.showNotification) window.showNotification(message, claimed ? 'warning' : 'error');
            claimButton.disabled = claimed;
        }
    }

    // --- RENDERIZAR LISTA DE AMIGOS ---
    function renderFriendsList(friendsData) {
        const friendsListContainer = document.getElementById('friends-list');
        if (!friendsListContainer) return;
        friendsListContainer.innerHTML = '';

        const friends = (friendsData && Array.isArray(friendsData.friends)) ? friendsData.friends : (Array.isArray(friendsData) ? friendsData : []);
        const pending = (friendsData && Array.isArray(friendsData.pending)) ? friendsData.pending : [];
        const sent = (friendsData && Array.isArray(friendsData.sent)) ? friendsData.sent : [];

        // 1. Solicitudes Pendientes (Recibidas)
        if (pending.length > 0) {
            friendsListContainer.innerHTML += '<h4 style="grid-column: 1/-1; color: var(--neon-pink); margin-top: 10px;"><i class="fas fa-inbox"></i> Solicitudes Pendientes</h4>';
            pending.forEach(user => {
                friendsListContainer.innerHTML += `
                    <div class="friend-item" data-user-id="${user.id}" data-user-status="${user.status || 'Disponible'}">
                        <img src="${user.avatar_url || DEFAULT_AVATAR_URL}" alt="Avatar" class="friend-avatar">
                        <div class="friend-info">
                            <span class="friend-name">
                                <span class="status-indicator online"></span>
                                ${user.username}
                            </span>
                            <span class="friend-role">${user.role || 'Jugador'}</span>
                        </div>
                        <div class="friend-actions">
                            <button class="action-btn accept-btn" title="Aceptar Solicitud"><i class="fas fa-check"></i></button>
                            <button class="action-btn remove-btn" title="Rechazar"><i class="fas fa-times"></i></button>
                        </div>
                    </div>
                `;
            });
        }

        // 2. Mis Amigos
        friendsListContainer.innerHTML += '<h4 style="grid-column: 1/-1; color: var(--neon-blue); margin-top: 15px;"><i class="fas fa-user-friends"></i> Mis Amigos (' + friends.length + ')</h4>';
        if (friends.length > 0) {
            friends.forEach(user => {
                friendsListContainer.innerHTML += `
                    <div class="friend-item" data-user-id="${user.id}" data-user-status="${user.status || 'Disponible'}">
                        <img src="${user.avatar_url || DEFAULT_AVATAR_URL}" alt="Avatar" class="friend-avatar">
                        <div class="friend-info">
                            <span class="friend-name">
                                <span class="status-indicator online"></span>
                                ${user.username}
                            </span>
                            <span class="friend-role">${user.role || 'Jugador'}</span>
                        </div>
                        <div class="friend-actions">
                            <button class="action-btn remove-btn" title="Eliminar Amigo"><i class="fas fa-user-minus"></i></button>
                        </div>
                    </div>
                `;
            });
        } else {
            friendsListContainer.innerHTML += '<p class="placeholder-content" style="grid-column: 1/-1;">Aún no tienes amigos añadidos. ¡Utiliza el buscador de arriba para encontrar y agregar compañeros!</p>';
        }

        // 3. Solicitudes Enviadas
        if (sent.length > 0) {
            friendsListContainer.innerHTML += '<h4 style="grid-column: 1/-1; color: var(--text-color-dark); margin-top: 15px;"><i class="fas fa-paper-plane"></i> Solicitudes Enviadas</h4>';
            sent.forEach(user => {
                friendsListContainer.innerHTML += `
                    <div class="friend-item" data-user-id="${user.id}" data-user-status="${user.status || 'Disponible'}">
                        <img src="${user.avatar_url || DEFAULT_AVATAR_URL}" alt="Avatar" class="friend-avatar">
                        <div class="friend-info">
                            <span class="friend-name">
                                <span class="status-indicator online"></span>
                                ${user.username}
                            </span>
                            <span class="friend-role">${user.role || 'Jugador'} (Esperando respuesta)</span>
                        </div>
                        <div class="friend-actions">
                            <button class="action-btn remove-btn" title="Cancelar Solicitud"><i class="fas fa-times"></i></button>
                        </div>
                    </div>
                `;
            });
        }
        updateAllStatusIndicators();
    }

    // --- ACCIONES DE AMIGOS (Aceptar, Eliminar, Añadir) ---
    async function handleFriendAction(action, targetIdentifier) {
        const urlMap = {
            accept: `${BACKEND_URL}/api/friends/accept`,
            remove: `${BACKEND_URL}/api/friends/remove`,
            add: `${BACKEND_URL}/api/friends/add`,
        };
        const url = urlMap[action];
        const body = action === 'add' ? { username: targetIdentifier } : { friend_id: targetIdentifier };

        try {
            window.showNotification('Procesando solicitud...', 'info');
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Error en la acción de amigos.');

            window.showNotification(result.message || 'Operación realizada con éxito.', 'success');

            // Recargar lista actualizada
            const friendsResponse = await fetch(`${BACKEND_URL}/api/friends`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (friendsResponse.ok) {
                const updatedFriendsData = await friendsResponse.json();
                renderFriendsList(updatedFriendsData);
            }
        } catch (error) {
            window.showNotification(error.message, 'error');
        }
    }

    // Delegación de eventos para clicks en la lista de amigos
    document.getElementById('friends-list')?.addEventListener('click', (e) => {
        const target = e.target.closest('.action-btn');
        if (!target) return;

        const friendItem = target.closest('.friend-item');
        const friendId = friendItem?.dataset.userId;

        if (target.classList.contains('accept-btn')) {
            handleFriendAction('accept', friendId);
        } else if (target.classList.contains('remove-btn')) {
            handleFriendAction('remove', friendId);
        }
    });

    // --- BÚSQUEDA FUNCIONAL DE PERSONAS (SOLO USUARIOS REALES EXISTENTES) ---
    function setupFriendSearch(currentUser, friendsData) {
        const searchInput = document.getElementById('friend-search-input');
        const searchBtn = document.getElementById('friend-search-btn');
        const searchResultsBox = document.getElementById('search-results-box');
        const searchResultsList = document.getElementById('search-results-list');

        if (!searchInput) return;

        const performSearch = async () => {
            const query = searchInput.value.trim();
            if (!query) {
                if (searchResultsBox) searchResultsBox.style.display = 'none';
                return;
            }

            if (query.toLowerCase() === (currentUser.username || '').toLowerCase()) {
                window.showNotification('No puedes buscarte ni añadirte a ti mismo.', 'warning');
                return;
            }

            if (searchResultsBox && searchResultsList) {
                searchResultsBox.style.display = 'block';
                searchResultsList.innerHTML = `
                    <div style="text-align: center; color: var(--neon-blue); padding: 15px; grid-column: 1/-1;">
                        <i class="fas fa-spinner fa-spin"></i> Buscando usuario en la base de datos...
                    </div>
                `;

                let foundUsers = [];

                // 1. Buscar a través del endpoint oficial del Backend (/api/users/search)
                try {
                    const searchRes = await fetch(`${BACKEND_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (searchRes.ok) {
                        const usersList = await searchRes.json();
                        if (Array.isArray(usersList) && usersList.length > 0) {
                            foundUsers = usersList.filter(u => u.username.toLowerCase() !== (currentUser.username || '').toLowerCase());
                        }
                    }
                } catch (bErr) {
                    console.warn("Aviso al consultar /api/users/search:", bErr);
                }

                // 2. Intentar buscar directamente en Supabase si no devolvió resultados
                if (foundUsers.length === 0 && window.glauncherSupabase) {
                    try {
                        const { data, error } = await window.glauncherSupabase
                            .from('users')
                            .select('id, username, role, avatar_url, status')
                            .ilike('username', `%${query}%`)
                            .limit(6);

                        if (data && data.length > 0) {
                            foundUsers = data.filter(u => u.username.toLowerCase() !== (currentUser.username || '').toLowerCase());
                        }
                    } catch (sErr) {
                        console.warn("Consulta Supabase directa no disponible:", sErr);
                    }
                }

                // 3. Si no encontró por Supabase o devolvió vacío, verificar existencia con el endpoint check-username
                if (foundUsers.length === 0) {
                    try {
                        const response = await fetch(`${BACKEND_URL}/api/auth/check-username`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username: query })
                        });
                        const data = await response.json();
                        // Si available === false significa que el usuario SÍ EXISTE en la base de datos
                        if (data && data.available === false) {
                            foundUsers.push({
                                id: query,
                                username: query,
                                role: 'Jugador',
                                avatar_url: `https://crafatar.com/avatars/${query}?size=100&overlay`
                            });
                        }
                    } catch (apiErr) {
                        console.warn("Error al verificar usuario:", apiErr);
                    }
                }

                // 3. Renderizar resultados reales
                if (foundUsers.length > 0) {
                    searchResultsList.innerHTML = '';
                    foundUsers.forEach(user => {
                        const isAlreadyFriend = (friendsData.friends || []).some(f => (f.username || '').toLowerCase() === user.username.toLowerCase());
                        const isPending = (friendsData.sent || []).some(s => (s.username || '').toLowerCase() === user.username.toLowerCase());

                        let actionButtonHtml = `
                            <button type="button" class="action-btn save-btn add-friend-btn" data-username="${user.username}">
                                <i class="fas fa-user-plus"></i> Añadir Amigo
                            </button>
                        `;

                        if (isAlreadyFriend) {
                            actionButtonHtml = `<span style="color: var(--neon-green); font-size: 0.85em;"><i class="fas fa-check"></i> Ya es tu amigo</span>`;
                        } else if (isPending) {
                            actionButtonHtml = `<span style="color: var(--text-color-dark); font-size: 0.85em;"><i class="fas fa-clock"></i> Solicitud enviada</span>`;
                        }

                        const userCard = document.createElement('div');
                        userCard.className = 'friend-item';
                        userCard.style.borderLeftColor = 'var(--neon-green)';
                        userCard.innerHTML = `
                            <img src="${user.avatar_url || DEFAULT_AVATAR_URL}" alt="Avatar" class="friend-avatar" onerror="this.src='${DEFAULT_AVATAR_URL}'">
                            <div class="friend-info">
                                <span class="friend-name" style="color: var(--neon-green);"><i class="fas fa-user-check"></i> ${user.username}</span>
                                <span class="friend-role">${user.role || 'Jugador Registrado'}</span>
                            </div>
                            <div class="friend-actions">
                                ${actionButtonHtml}
                            </div>
                        `;

                        userCard.querySelector('.add-friend-btn')?.addEventListener('click', () => {
                            handleFriendAction('add', user.username);
                        });

                        searchResultsList.appendChild(userCard);
                    });
                } else {
                    searchResultsList.innerHTML = `
                        <div class="placeholder-content" style="grid-column: 1/-1; padding: 15px; color: var(--neon-pink);">
                            <i class="fas fa-user-times" style="font-size: 2em; margin-bottom: 8px;"></i>
                            <p>No se encontró ningún usuario registrado con el nombre "<strong>${query}</strong>".</p>
                        </div>
                    `;
                }
            }
        };

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });

        if (searchBtn) {
            searchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                performSearch();
            });
        }
    }

    // --- LÓGICA DE GCHAT (MENSAJERÍA PRIVADA) ---
    function initializeGChat(userData, friendsData) {
        const conversationList = document.getElementById('gchat-conversation-list');
        const messagesContainer = document.getElementById('gchat-messages-container');
        const inputForm = document.getElementById('gchat-input-form');
        const welcomeScreen = document.getElementById('gchat-welcome-screen');
        const gifPicker = document.getElementById('gchat-gif-picker');
        const gifResults = document.getElementById('gchat-gif-results');
        const gifQuery = document.getElementById('gchat-gif-query');
        let currentRecipient = null;
        let chatChannel = null;
        let pollTimer = null;
        let replyingToMessage = null;
        const renderedMessageIds = new Set();

        if (!conversationList) return;
        document.getElementById('gchat-gif-toggle')?.addEventListener('click', () => {
            gifPicker.hidden = !gifPicker.hidden;
            if (!gifPicker.hidden) {
                gifQuery.focus();
                searchGifs();
            }
        });
        document.getElementById('gchat-gif-search-btn')?.addEventListener('click', searchGifs);
        document.getElementById('gchat-reply-cancel')?.addEventListener('click', cancelReply);
        gifQuery?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                searchGifs();
            }
        });

        // 1. Poblar conversaciones con amigos
        conversationList.innerHTML = '';
        const friends = (friendsData && Array.isArray(friendsData.friends)) ? friendsData.friends : [];

        if (friends.length > 0) {
            friends.forEach(friend => {
                const convoItem = document.createElement('div');
                convoItem.className = 'gchat-conversation-item';
                convoItem.dataset.friendId = friend.id;
                convoItem.dataset.friendName = friend.username;
                convoItem.dataset.userStatus = friend.status || 'Disponible';
                convoItem.innerHTML = `
                    <img src="${friend.avatar_url || DEFAULT_AVATAR_URL}" alt="Avatar" class="friend-avatar">
                    <div class="friend-info">
                        <span class="friend-name">
                            <span class="status-indicator online"></span>
                            ${friend.username}
                        </span>
                    </div>
                `;
                conversationList.appendChild(convoItem);
            });
        } else {
            conversationList.innerHTML = '<p class="placeholder-content" style="padding: 20px 10px;">Agrega amigos en la pestaña "Amigos" para chatear en privado.</p>';
        }
        updateAllStatusIndicators();

        // 2. Manejar selección de conversación
        conversationList.addEventListener('click', async (e) => {
            const target = e.target.closest('.gchat-conversation-item');
            if (!target) return;

            document.querySelectorAll('.gchat-conversation-item').forEach(item => item.classList.remove('active'));
            target.classList.add('active');

            const friendId = target.dataset.friendId;
            const friendName = target.dataset.friendName;
            currentRecipient = { id: friendId, username: friendName };
            renderedMessageIds.clear();
            cancelReply();
            messagesContainer.replaceChildren();
            gifPicker.hidden = true;

            if (welcomeScreen) welcomeScreen.style.display = 'none';
            if (messagesContainer) messagesContainer.style.display = 'flex';
            if (inputForm) inputForm.style.display = 'flex';

            await loadChatHistory(friendId);
            subscribeToChatChannel(userData.id, friendId);
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = setInterval(() => {
                if (currentRecipient?.id === friendId) loadChatHistory(friendId);
            }, 5000);
        });

        // 3. Cargar historial
        async function loadChatHistory(friendId) {
            if (!messagesContainer) return;
            try {
                const response = await fetch(`${BACKEND_URL}/api/gchat/history/${friendId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    throw new Error(`No se pudo cargar el historial del chat (${response.status}).`);
                }
                const messages = await response.json();
                if (currentRecipient?.id !== friendId) return;
                messagesContainer.querySelector('.gchat-history-error')?.remove();
                messages.forEach(renderPrivateMessage);
                if (!renderedMessageIds.size) {
                    const empty = document.createElement('p');
                    empty.className = 'placeholder-content';
                    empty.textContent = 'No hay mensajes previos. ¡Escribe un saludo!';
                    messagesContainer.replaceChildren(empty);
                }
            } catch (error) {
                if (currentRecipient?.id === friendId) {
                    let failure = messagesContainer.querySelector('.gchat-history-error');
                    if (!failure) {
                        failure = document.createElement('p');
                        failure.className = 'placeholder-content gchat-history-error';
                        messagesContainer.appendChild(failure);
                    }
                    failure.textContent = error.message;
                }
            }
        }

        // 4. Renderizar mensaje
        function renderPrivateMessage(msg) {
            if (!messagesContainer) return;
            if (msg.id && renderedMessageIds.has(String(msg.id))) return;
            const content = msg.content ?? msg.message ?? '';
            const messageEl = document.createElement('div');
            const isSent = String(msg.sender_id) === String(userData.id);
            messageEl.className = `gchat-message ${isSent ? 'sent' : 'received'}`;
            if (msg.id) messageEl.id = `gchat-message-${msg.id}`;
            if (msg.reply_to_message_id && msg.reply_to_message !== null) {
                const quote = document.createElement('button');
                quote.className = 'gchat-message-reply-preview';
                quote.type = 'button';
                quote.addEventListener('click', () => {
                    document.getElementById(`gchat-message-${msg.reply_to_message_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
                const quoteAuthor = document.createElement('strong');
                quoteAuthor.textContent = msg.reply_to_username || 'Mensaje';
                const quoteText = document.createElement('span');
                quoteText.textContent = isGiphyUrl(msg.reply_to_message) ? 'GIF' : msg.reply_to_message;
                quote.append(quoteAuthor, quoteText);
                messageEl.appendChild(quote);
            }
            const gifUrl = isGiphyUrl(content) ? content : null;
            if (gifUrl) {
                const image = document.createElement('img');
                image.src = gifUrl;
                image.alt = 'GIF';
                image.loading = 'lazy';
                image.referrerPolicy = 'no-referrer';
                messageEl.appendChild(image);
            } else {
                const text = document.createElement('p');
                text.textContent = content;
                messageEl.appendChild(text);
            }
            if (msg.id) {
                const replyButton = document.createElement('button');
                replyButton.className = 'gchat-message-reply';
                replyButton.type = 'button';
                replyButton.textContent = 'Responder';
                replyButton.addEventListener('click', () => beginReply(msg));
                messageEl.appendChild(replyButton);
            }
            if (msg.id) renderedMessageIds.add(String(msg.id));
            messagesContainer.querySelector('.placeholder-content')?.remove();
            messagesContainer.appendChild(messageEl);
            if (isSent) applyEquippedBubble(messageEl);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        function beginReply(msg) {
            replyingToMessage = msg;
            document.getElementById('gchat-replying-author').textContent =
                String(msg.sender_id) === String(userData.id) ? 'Respondiendo a ti' : (msg.sender_username || currentRecipient?.username || 'Amigo');
            const content = msg.message ?? msg.content ?? '';
            document.getElementById('gchat-replying-content').textContent = isGiphyUrl(content) ? 'GIF' : content;
            document.getElementById('gchat-replying').hidden = false;
            document.getElementById('gchat-message-input').focus();
        }

        function cancelReply() {
            replyingToMessage = null;
            const replyBar = document.getElementById('gchat-replying');
            if (replyBar) replyBar.hidden = true;
        }

        function isGiphyUrl(value) {
            return typeof value === 'string' && /^https:\/\/(?:[\w-]+\.)*giphy\.com\/[^\s]*$/i.test(value);
        }

        // 5. Suscripción Pusher
        function subscribeToChatChannel(userId, friendId) {
            if (!realtimePusher) return;
            if (chatChannel) realtimePusher.unsubscribe(chatChannel.name);
            const channelName = `chat-${[String(userId), String(friendId)].sort().join('-')}`;
            chatChannel = realtimePusher.subscribe(channelName);
            chatChannel.bind('new-message', (data) => {
                if (currentRecipient && (
                    String(data.sender_id) === String(currentRecipient.id) ||
                    String(data.receiver_id || data.recipient_id) === String(currentRecipient.id)
                )) {
                    renderPrivateMessage(data);
                }
            });
        }

        // 6. Enviar mensaje
        inputForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('gchat-message-input');
            const content = input.value.trim();
            const recipientId = currentRecipient?.id;
            const replyToMessageId = replyingToMessage?.id || null;

            if (!content || !recipientId) return;

            try {
                const response = await fetch(`${BACKEND_URL}/api/gchat/send/${recipientId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ content, replyToMessageId })
                });
                if (!response.ok) {
                    throw new Error(`No se pudo enviar el mensaje (${response.status}).`);
                }
                const sentMessage = await response.json();
                if (String(currentRecipient?.id) === String(recipientId)) {
                    renderPrivateMessage(sentMessage);
                    if (replyingToMessage?.id === replyToMessageId) cancelReply();
                    gifPicker.hidden = true;
                }
                if (String(currentRecipient?.id) === String(recipientId) && input.value.trim() === content) {
                    input.value = '';
                }
            } catch (error) {
                window.showNotification(error.message, 'error');
            }
        });

        async function searchGifs() {
            gifResults.replaceChildren();
            const loading = document.createElement('p');
            loading.className = 'placeholder-content';
            loading.textContent = 'Buscando GIFs...';
            gifResults.appendChild(loading);
            const query = gifQuery.value.trim() || 'minecraft';
            try {
                const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=12&rating=pg`);
                if (!response.ok) throw new Error('Giphy no pudo completar la búsqueda.');
                const data = await response.json();
                gifResults.replaceChildren();
                for (const gif of data.data || []) {
                    const url = gif.images?.fixed_height?.url;
                    if (!isGiphyUrl(url)) continue;
                    const button = document.createElement('button');
                    button.className = 'gchat-gif-option';
                    button.type = 'button';
                    button.setAttribute('aria-label', 'Enviar GIF');
                    const image = document.createElement('img');
                    image.src = url;
                    image.alt = gif.title || 'GIF';
                    image.loading = 'lazy';
                    button.appendChild(image);
                    button.addEventListener('click', () => {
                        document.getElementById('gchat-message-input').value = url;
                        inputForm.requestSubmit();
                    });
                    gifResults.appendChild(button);
                }
                if (!gifResults.childElementCount) {
                    const empty = document.createElement('p');
                    empty.className = 'placeholder-content';
                    empty.textContent = 'No se encontraron GIFs.';
                    gifResults.appendChild(empty);
                }
            } catch (error) {
                gifResults.replaceChildren();
                const failure = document.createElement('p');
                failure.className = 'placeholder-content';
                failure.textContent = error.message;
                gifResults.appendChild(failure);
            }
        }
    }

    // --- LÓGICA DE LOGROS ---
    async function initializeAchievements(userData, friendsData) {
        const achievements = [
            { id: 'first_download', title: 'Iniciando el Viaje', description: 'Descarga tu primera versión de Minecraft.', icon: 'fa-download', color: '#00f3ff' },
            { id: 'first_launch', title: 'Primer Despegue', description: 'Inicia el juego por primera vez desde GLauncher.', icon: 'fa-play', color: '#00f3ff' },
            { id: 'melomano', title: 'Melómano', description: 'Escucha tu primera canción en GMusic.', icon: 'fa-music', color: '#ff00ff' },
            { id: 'rey_del_pop', title: 'Rey del PoP', description: 'Escucha una canción de Michael Jackson en GMusic.', icon: 'fa-crown', color: '#f1c40f' },
            { id: 'socializer', title: 'Socializador', description: 'Envía tu primer mensaje en el GChat global.', icon: 'fa-comments', color: '#48dbfb' },
            { id: 'stylist', title: 'Estilista', description: 'Personaliza tu skin por primera vez.', icon: 'fa-shirt', color: '#feca57' },
            { id: 'configurator', title: 'Configurador', description: 'Modifica los ajustes técnicos del launcher.', icon: 'fa-gear', color: '#95afc0' },
            { id: 'mod_hunter', title: 'Cazador de Mods', description: 'Busca contenido en la galería de Modrinth.', icon: 'fa-cubes', color: '#ff9f43' },
            { id: 'veteran', title: 'Veterano', description: 'Abre el launcher al menos 5 veces.', icon: 'fa-calendar-check', color: '#ff4757' },
            { id: 'explorer', title: 'Explorador', description: 'Visita todas las pestañas de navegación.', icon: 'fa-map-location-dot', color: '#2ed573' },
            { id: 'cleaner', title: 'Limpieza Profunda', description: 'Elimina un avatar antiguo del historial.', icon: 'fa-broom', color: '#70a1ff' },
            { id: 'server_adder', title: 'Arquitecto de Redes', description: 'Agrega tu primer servidor personalizado a la lista.', icon: 'fa-network-wired', color: '#48dbfb' },
            { id: 'ram_master', title: 'Maestro del Java', description: 'Asigna más de 8GB de memoria RAM al juego.', icon: 'fa-microchip', color: '#f1c40f' },
            { id: 'old_school', title: 'A la Antigua', description: 'Juega una versión clásica de Minecraft.', icon: 'fa-clock-rotate-left', color: '#ff9f43' },
            { id: 'bg_collector', title: 'Coleccionista', description: 'Añade fondos personalizados al launcher.', icon: 'fa-images', color: '#ff00ff' },
            { id: 'fullscreen_king', title: 'Rey de la Pantalla', description: 'Juega en pantalla completa.', icon: 'fa-expand', color: '#2ed573' },
            { id: 'modloader_expert', title: 'Experto en Modloaders', description: 'Instala un modloader para Minecraft.', icon: 'fa-wand-magic-sparkles', color: '#ff9f43' },
            { id: 'safety_first', title: 'La Seguridad Primero', description: 'Configura una carpeta de juego independiente.', icon: 'fa-shield-halved', color: '#48dbfb' },
            { id: 'pioneer', title: 'Pionero', description: 'Regístrate durante la fase BETA.', icon: 'fa-rocket', recommended: true, isUnlocked: data => new Date(data.created_at || Date.now()) < new Date('2027-01-01') },
            { id: 'socialite', title: 'Sociable', description: 'Agrega a tu primer amigo a tu lista.', icon: 'fa-user-group', recommended: true, isUnlocked: () => (friendsData?.friends || []).length > 0 },
            { id: 'gamer', title: 'Veterano web', description: 'Juega más de 10 horas con GLauncher.', icon: 'fa-gamepad', isUnlocked: data => (data.play_time_seconds || 0) >= 36000 },
            { id: 'rich', title: 'Adinerado', description: 'Acumula 1,000 GCoins en tu saldo.', icon: 'fa-coins', isUnlocked: data => (data.gcoins || 0) >= 1000 }
        ];
        const grid = document.getElementById('achievements-grid');
        const filterButtons = document.querySelectorAll('.achievements-filter-controls .filter-btn');

        if (!grid) return;

        let persistedIds = new Set();
        if (token) {
            try {
                const response = await fetch(`${BACKEND_URL}/api/achievements/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    const result = await response.json().catch(() => ({}));
                    throw new Error(result.message || `Error ${response.status}`);
                }
                const records = await response.json();
                persistedIds = new Set(records.map(record => record.achievement_id));
            } catch (error) {
                console.warn('No se pudieron cargar los logros guardados:', error);
            }
        }

        function renderAchievements(filter = 'all') {
            grid.innerHTML = '';
            const userAchievements = achievements.map(ach => ({
                ...ach,
                unlocked: persistedIds.has(ach.id) || Boolean(ach.isUnlocked?.(userData))
            }));

            let filtered = userAchievements;
            if (filter === 'unlocked') filtered = userAchievements.filter(a => a.unlocked);
            if (filter === 'locked') filtered = userAchievements.filter(a => !a.unlocked);
            if (filter === 'recommended') filtered = userAchievements.filter(a => a.recommended && !a.unlocked);

            if (filtered.length === 0) {
                grid.innerHTML = '<p class="placeholder-content">No hay logros para mostrar en este filtro.</p>';
                return;
            }

            filtered.forEach(ach => {
                const card = document.createElement('div');
                card.className = `achievement-card ${ach.unlocked ? 'unlocked' : 'locked'}`;
                card.innerHTML = `
                    <i class="fas ${ach.icon} achievement-icon" aria-hidden="true" style="color: ${ach.color || '#00f3ff'}"></i>
                    <div class="achievement-info">
                        <h4 style="color: ${ach.unlocked ? 'var(--neon-green)' : 'var(--text-color-light)'}">${ach.title}</h4>
                        <p style="font-size: 0.85em; color: var(--text-color-dark); margin: 6px 0;">${ach.description}</p>
                        <div class="achievement-progress">
                            <div class="progress-bar" style="width: ${ach.unlocked ? '100%' : '0%'}"></div>
                        </div>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                renderAchievements(button.dataset.filter);
            });
        });

        renderAchievements('all');
    }

    // --- LÓGICA DE TODOS LOS AJUSTES (FUNCIONALES) ---
    function initializeSettings(userData) {
        // 1. Navegación entre pestañas de Ajustes
        const settingsNavBtns = document.querySelectorAll('.settings-nav-btn');
        const settingsPanels = document.querySelectorAll('.settings-panel');

        settingsNavBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPanel = btn.dataset.panel;
                settingsNavBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                settingsPanels.forEach(panel => {
                    panel.classList.remove('active');
                    if (panel.id === targetPanel) panel.classList.add('active');
                });
            });
        });

        // 2. AJUSTES DE PERFIL (Nombre y Avatar)
        const profileForm = document.getElementById('account-settings-form');
        const avatarPreview = document.getElementById('settings-avatar-preview');
        const avatarFileInput = document.getElementById('avatar-change-file');
        const usernameInput = document.getElementById('username-change');

        if (usernameInput) usernameInput.value = userData.username || '';
        if (avatarPreview) setAvatarSource(avatarPreview, userData.avatar_url || userData.profile_picture_url);

        if (avatarFileInput) {
            avatarFileInput.addEventListener('change', () => {
                const file = avatarFileInput.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        if (avatarPreview) avatarPreview.src = e.target.result;
                        const navAvatar = document.getElementById('nav-avatar');
                        if (navAvatar) navAvatar.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const saveBtn = document.getElementById('save-profile-btn');
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
                }

                const newUsername = usernameInput.value.trim();
                const formData = new FormData();
                formData.append('username', newUsername);
                if (avatarFileInput && avatarFileInput.files[0]) {
                    formData.append('avatar_file', avatarFileInput.files[0]);
                }

                try {
                    const response = await fetch(`${BACKEND_URL}/api/user/update_profile`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });

                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message || 'No se pudo actualizar el perfil.');

                    const updatedUser = result.user || {};
                    const navUsername = document.getElementById('nav-username');
                    if (navUsername) navUsername.textContent = updatedUser.username || newUsername;
                    if (updatedUser.avatar_url || updatedUser.profile_picture_url) {
                        setAvatarSource(document.getElementById('nav-avatar'), updatedUser.avatar_url || updatedUser.profile_picture_url);
                        setAvatarSource(avatarPreview, updatedUser.avatar_url || updatedUser.profile_picture_url);
                    }
                    if (result.token) localStorage.setItem('glauncher_token', result.token);
                    window.showNotification(result.message || '¡Perfil actualizado con éxito!', 'success');
                } catch (error) {
                    window.showNotification(error.message || 'No se pudo actualizar el perfil.', 'error');
                } finally {
                    if (saveBtn) {
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Perfil';
                    }
                }
            });
        }

        // 3. AJUSTES DE SEGURIDAD (Cambiar Contraseña)
        const securityForm = document.getElementById('security-settings-form');
        if (securityForm) {
            securityForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const currentPass = document.getElementById('current-password-input').value;
                const newPass = document.getElementById('new-password-input').value;
                const confirmPass = document.getElementById('confirm-new-password-input').value;

                if (newPass !== confirmPass) {
                    window.showNotification('Las nuevas contraseñas no coinciden.', 'error');
                    return;
                }

                if (newPass.length < 6) {
                    window.showNotification('La nueva contraseña debe tener al menos 6 caracteres.', 'error');
                    return;
                }

                const updatePassBtn = document.getElementById('update-password-btn');
                if (updatePassBtn) {
                    updatePassBtn.disabled = true;
                    updatePassBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
                }

                try {
                    const response = await fetch(`${BACKEND_URL}/api/user/update_password`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ current_password: currentPass, new_password: newPass })
                    });

                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message || 'Error al actualizar contraseña.');

                    window.showNotification('¡Contraseña actualizada con éxito!', 'success');
                    securityForm.reset();
                } catch (error) {
                    window.showNotification(error.message, 'error');
                } finally {
                    if (updatePassBtn) {
                        updatePassBtn.disabled = false;
                        updatePassBtn.innerHTML = '<i class="fas fa-key"></i> Actualizar Contraseña';
                    }
                }
            });
        }

        // 4. AJUSTES DE PRIVACIDAD (Toggles)
        const onlineToggle = document.getElementById('privacy-online-toggle');
        const requestsToggle = document.getElementById('privacy-requests-toggle');

        if (onlineToggle) {
            onlineToggle.checked = localStorage.getItem('glauncher_privacy_online') !== 'false';
            onlineToggle.addEventListener('change', () => {
                localStorage.setItem('glauncher_privacy_online', onlineToggle.checked.toString());
                window.showNotification(onlineToggle.checked ? 'Estado en línea visible.' : 'Estado en línea oculto.', 'info');
            });
        }

        if (requestsToggle) {
            requestsToggle.checked = localStorage.getItem('glauncher_privacy_requests') !== 'false';
            requestsToggle.addEventListener('change', () => {
                localStorage.setItem('glauncher_privacy_requests', requestsToggle.checked.toString());
                window.showNotification(requestsToggle.checked ? 'Solicitudes de amistad permitidas.' : 'Solicitudes de amistad bloqueadas.', 'info');
            });
        }

        // 5. ZONA DE PELIGRO (Eliminar Cuenta)
        const deleteAccountBtn = document.getElementById('delete-account-btn');
        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', async () => {
                const confirmed = confirm('⚠️ ADVERTENCIA: ¿Estás seguro de que deseas eliminar permanentemente tu cuenta de GLauncher? Esta acción borrará tus datos, estadísticas y progreso sin posibilidad de recuperación.');
                if (!confirmed) return;

                const secondConfirm = prompt('Escribe "ELIMINAR" para confirmar la eliminación de tu cuenta:');
                if (secondConfirm !== 'ELIMINAR') {
                    window.showNotification('Acción cancelada.', 'info');
                    return;
                }

                try {
                    window.showNotification('Eliminando cuenta...', 'info');
                    await fetch(`${BACKEND_URL}/api/user/delete_account`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                } catch (err) {
                    console.warn("Error enviando petición de borrado:", err);
                }

                localStorage.removeItem('glauncher_token');
                window.showNotification('Tu cuenta ha sido eliminada. Redirigiendo...', 'success');
                setTimeout(() => window.location.href = '../../index.html', 1500);
            });
        }
    }

    // --- LÓGICA DEL MENÚ DE ESTADO ---
    function initializeStatusSystem(userData) {
        const statusDisplay = document.getElementById('status-display');
        const statusOptionsContainer = document.getElementById('status-options');
        const statuses = {
            'Disponible': 'online',
            'Ausente': 'away',
            'Jugando': 'playing'
        };

        if (!statusDisplay || !statusOptionsContainer) return;

        statusOptionsContainer.innerHTML = Object.keys(statuses).map(status => 
            `<div class="status-option" data-status="${status}">
                <span class="status-indicator ${statuses[status]}"></span>
                ${status}
            </div>`
        ).join('');

        statusDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            statusOptionsContainer.style.display = statusOptionsContainer.style.display === 'block' ? 'none' : 'block';
        });

        statusOptionsContainer.addEventListener('click', async (e) => {
            const target = e.target.closest('.status-option');
            if (!target) return;

            const newStatus = target.dataset.status;
            statusOptionsContainer.style.display = 'none';
            updateStatusIndicator(document.getElementById('status-indicator'), newStatus);
            const statusText = document.getElementById('status-text');
            if (statusText) statusText.textContent = newStatus;

            try {
                await fetch(`${BACKEND_URL}/api/user/status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ status: newStatus })
                });
            } catch (error) {
                console.warn("Error al actualizar estado:", error);
            }
        });

        document.addEventListener('click', () => {
            statusOptionsContainer.style.display = 'none';
        });

        const initialStatus = userData.status || 'Disponible';
        updateStatusIndicator(document.getElementById('status-indicator'), initialStatus);
        const statusText = document.getElementById('status-text');
        if (statusText) statusText.textContent = initialStatus;
    }

    function updateStatusIndicator(element, status) {
        if (!element) return;
        element.className = 'status-indicator';
        if (status === 'Disponible') element.classList.add('online');
        else if (status === 'Ausente') element.classList.add('away');
        else if (status === 'Jugando') element.classList.add('playing');
    }

    function updateAllStatusIndicators() {
        document.querySelectorAll('[data-user-status]').forEach(el => {
            updateStatusIndicator(el.querySelector('.status-indicator'), el.dataset.userStatus);
        });
    }

    // --- MODO DEMO DE RESPALDO ---
    function loadDemoData() {
        populateStats({ gcoins: 0, owned_cosmetics: [], created_at: Date.now(), play_time_seconds: 0 });
    }

    // --- RECARGA DE LISTA DE AMIGOS ---
    async function reloadFriendsList() {
        try {
            const friendsResponse = await fetch(`${BACKEND_URL}/api/friends`, { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            if (friendsResponse.ok) {
                const updatedFriends = await friendsResponse.json();
                renderFriendsList(updatedFriends);
            }
        } catch (e) {
            console.warn("Error al actualizar lista de amigos:", e);
        }
    }
    window.reloadFriendsList = reloadFriendsList;

    // --- NOTIFICACIONES REALTIME PUSHER ---
    function initializeRealtimeNotifications(userData, friendsData) {
        if (typeof Pusher === 'undefined') return;
        try {
            if (!realtimePusher) {
                realtimePusher = new Pusher(PUSHER_KEY, { cluster: 'us2' });
            }
            const pusher = realtimePusher;

            // Suscripción al canal personal del usuario (por ID y por username)
            const userChanId = pusher.subscribe(`user-${userData.id}`);
            const userChanName = pusher.subscribe(`user-${userData.username}`);

            const handleFriendRequest = (data) => {
                const senderName = data.from?.username || data.username || 'Un jugador';
                window.showNotification(`📩 ¡${senderName} te ha enviado una solicitud de amistad!`, 'info');
                reloadFriendsList();
            };

            const handleFriendAccepted = (data) => {
                const friendName = data.by?.username || data.username || 'Un jugador';
                window.showNotification(`🎉 ¡${friendName} aceptó tu solicitud de amistad!`, 'success');
                reloadFriendsList();
            };

            userChanId.bind('friend-request', handleFriendRequest);
            userChanName.bind('friend-request', handleFriendRequest);
            userChanId.bind('friend-accepted', handleFriendAccepted);
            userChanName.bind('friend-accepted', handleFriendAccepted);

            // Escuchar actualizaciones de estado
            const statusChannel = pusher.subscribe('user-status-channel');
            statusChannel.bind('status-update', (data) => {
                if (data.userId !== userData.id) {
                    const friendEl = document.querySelector(`.friend-item[data-user-id="${data.userId}"]`);
                    if (friendEl) {
                        friendEl.dataset.userStatus = data.status;
                        updateStatusIndicator(friendEl.querySelector('.status-indicator'), data.status);
                    }
                }
            });

            // Canal global de amigos
            const globalChannel = pusher.subscribe('global-friends-channel');
            globalChannel.bind('friend-updated', () => {
                reloadFriendsList();
            });

        } catch (err) {
            console.warn("Aviso Pusher:", err);
        }

        // Auto-actualización periódica de solicitudes y amigos cada 6 segundos
        setInterval(reloadFriendsList, 6000);
    }

    // Iniciar carga del Dashboard
    loadUserData();
});
