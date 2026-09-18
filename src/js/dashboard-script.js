document.addEventListener('DOMContentLoaded', () => {
    const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : 'https://glauncher-api.onrender.com';
    const DEFAULT_AVATAR_URL = 'https://crafatar.com/avatars/606e2ff0-ed77-4842-9d6c-e1d3321c7838?size=100&overlay';
    const PUSHER_KEY = 'a2fb8d4323a44da53c63';
    const token = localStorage.getItem('glauncher_token');

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
            avatar_url: `https://crafatar.com/avatars/${decodedToken.username || 'steve'}?size=100&overlay`,
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

        if (navAvatar) navAvatar.src = userData.avatar_url || userData.profile_picture_url || DEFAULT_AVATAR_URL;
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
        let currentRecipient = null;
        let chatChannel = null;

        if (!conversationList) return;

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

            if (welcomeScreen) welcomeScreen.style.display = 'none';
            if (messagesContainer) messagesContainer.style.display = 'flex';
            if (inputForm) inputForm.style.display = 'flex';

            await loadChatHistory(friendId);
            if (typeof pusher !== 'undefined') {
                subscribeToChatChannel(userData.id, friendId);
            }
        });

        // 3. Cargar historial
        async function loadChatHistory(friendId) {
            if (!messagesContainer) return;
            messagesContainer.innerHTML = '<div style="text-align: center; color: var(--neon-blue); padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Cargando mensajes...</div>';
            try {
                const response = await fetch(`${BACKEND_URL}/api/gchat/history/${friendId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const messages = await response.json();
                    messagesContainer.innerHTML = '';
                    if (Array.isArray(messages) && messages.length > 0) {
                        messages.forEach(renderPrivateMessage);
                    } else {
                        messagesContainer.innerHTML = '<p class="placeholder-content">No hay mensajes previos. ¡Escribe un saludo!</p>';
                    }
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } else {
                    messagesContainer.innerHTML = '<p class="placeholder-content">Inicia la conversación.</p>';
                }
            } catch (error) {
                messagesContainer.innerHTML = '<p class="placeholder-content">Inicia la conversación.</p>';
            }
        }

        // 4. Renderizar mensaje
        function renderPrivateMessage(msg) {
            if (!messagesContainer) return;
            const messageEl = document.createElement('div');
            const isSent = msg.sender_id === userData.id;
            messageEl.className = `gchat-message ${isSent ? 'sent' : 'received'}`;
            messageEl.innerHTML = `<p>${msg.content}</p>`;
            messagesContainer.appendChild(messageEl);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // 5. Suscripción Pusher
        function subscribeToChatChannel(userId, friendId) {
            if (chatChannel && typeof pusher !== 'undefined') {
                pusher.unsubscribe(chatChannel.name);
            }

            const channelName = `private-chat-${Math.min(userId, friendId)}-${Math.max(userId, friendId)}`;
            chatChannel = pusher.subscribe(channelName);

            chatChannel.bind('new_message', (data) => {
                if (currentRecipient && (data.sender_id == currentRecipient.id || data.recipient_id == currentRecipient.id)) {
                    renderPrivateMessage(data);
                } else {
                    window.showNotification('Nuevo mensaje recibido en GChat.', 'info');
                }
            });
        }

        // 6. Enviar mensaje
        inputForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('gchat-message-input');
            const content = input.value.trim();

            if (!content || !currentRecipient) return;

            // Renderizado optimista
            renderPrivateMessage({ sender_id: userData.id, content });
            input.value = '';

            try {
                await fetch(`${BACKEND_URL}/api/gchat/send/${currentRecipient.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ content })
                });
            } catch (error) {
                window.showNotification('No se pudo enviar el mensaje.', 'error');
            }
        });
    }

    // --- LÓGICA DE LOGROS ---
    function initializeAchievements(userData) {
        const achievements = [
            { id: 'pioneer', title: 'Pionero', description: 'Regístrate durante la fase BETA.', icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135789.png', recommended: true, isUnlocked: (data) => new Date(data.created_at || Date.now()) < new Date('2027-01-01') },
            { id: 'socialite', title: 'Sociable', description: 'Agrega a tu primer amigo a tu lista.', icon: 'https://cdn-icons-png.flaticon.com/512/1256/1256650.png', recommended: true, isUnlocked: (data) => (data.friends_count || 0) > 0 },
            { id: 'gamer', title: 'Veterano', description: 'Juega más de 10 horas con GLauncher.', icon: 'https://cdn-icons-png.flaticon.com/512/808/808439.png', recommended: false, isUnlocked: (data) => (data.play_time_seconds || 0) >= 36000 },
            { id: 'rich', title: 'Adinerado', description: 'Acumula 1,000 GCoins en tu saldo.', icon: 'https://cdn-icons-png.flaticon.com/512/2933/2933116.png', recommended: false, isUnlocked: (data) => (data.gcoins || 0) >= 1000 },
        ];

        const grid = document.getElementById('achievements-grid');
        const filterButtons = document.querySelectorAll('.achievements-filter-controls .filter-btn');

        if (!grid) return;

        function renderAchievements(filter = 'all') {
            grid.innerHTML = '';
            const userAchievements = achievements.map(ach => ({
                ...ach,
                unlocked: ach.isUnlocked(userData)
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
                    <img src="${ach.icon}" class="achievement-icon" alt="${ach.title}">
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
        if (avatarPreview) avatarPreview.src = userData.avatar_url || userData.profile_picture_url || DEFAULT_AVATAR_URL;

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
                    formData.append('avatar', avatarFileInput.files[0]);
                }

                try {
                    const response = await fetch(`${BACKEND_URL}/api/user/update_profile`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });

                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message || 'No se pudo actualizar el perfil.');

                    window.showNotification('¡Perfil actualizado con éxito!', 'success');
                    const navUsername = document.getElementById('nav-username');
                    if (navUsername) navUsername.textContent = newUsername;
                } catch (error) {
                    // Actualización local de respaldo
                    const navUsername = document.getElementById('nav-username');
                    if (navUsername) navUsername.textContent = newUsername;
                    window.showNotification('Perfil actualizado localmente.', 'success');
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
            const pusher = new Pusher(PUSHER_KEY, {
                cluster: 'us2'
            });

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
