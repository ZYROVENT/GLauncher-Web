/**
 * GLAUNCHER - Global UI Sound Script
 * Este script añade efectos de sonido de clic a varios elementos interactivos del sitio.
 */
document.addEventListener('DOMContentLoaded', () => {

    // ========================================================
    // A. LÓGICA DE CAPTURA DE TOKEN DESDE URL (PARA OAUTH)
    // ========================================================
    // Esta sección se encarga de manejar los tokens que llegan en la URL
    // después de un inicio de sesión social (Google, Microsoft, etc.).
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl) {
        // 1. Guardar el token en el almacenamiento local para usarlo en las peticiones
        localStorage.setItem('glauncher_token', tokenFromUrl);

        // 2. Limpiar la URL para que el token no quede visible ni se reutilice al recargar
        // Usamos history.replaceState para no recargar la página y no añadir al historial de navegación.
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        
        // 3. Opcional: mostrar una notificación de éxito
        if (window.showNotification) window.showNotification('Autenticación exitosa.', 'success');
    }

    // ========================================================
    // B. GESTIÓN GLOBAL DE ESTADO DE SESIÓN (LOGIN / DASHBOARD)
    // ========================================================
    window.initializeTabNavigation = (buttonSelector, contentSelector) => {
        const buttons = document.querySelectorAll(buttonSelector);
        const contents = document.querySelectorAll(contentSelector);
        if (!buttons.length || !contents.length) return;

        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = btn.getAttribute('data-target');
                if (!targetId) return;
                e.preventDefault();

                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                contents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === targetId) {
                        content.classList.add('active');
                    }
                });
            });
        });
    };

    function updateAuthNavigation() {
        const token = localStorage.getItem('glauncher_token');
        const path = window.location.pathname.toLowerCase();
        const isDashboardPage = path.endsWith('dashboard.html') || path.includes('/dashboard.html');

        // Seleccionar todos los enlaces al dashboard, login y registro
        const dashboardLinks = document.querySelectorAll('a[href*="dashboard.html"]');
        const loginLinks = document.querySelectorAll('a[href*="login.html"]');
        const registerLinks = document.querySelectorAll('a[href*="register.html"]');

        if (token) {
            // Usuario CON sesión iniciada:
            dashboardLinks.forEach(link => {
                link.style.display = '';
            });
            // Ocultar botones de Iniciar Sesión y Registro en el header
            loginLinks.forEach(link => {
                if (!link.closest('.bottom-nav')) {
                    link.style.display = 'none';
                }
            });
            registerLinks.forEach(link => {
                if (!link.closest('.bottom-nav')) {
                    link.style.display = 'none';
                }
            });
        } else {
            // Usuario SIN sesión iniciada:
            // Ocultar enlace de Dashboard por completo
            dashboardLinks.forEach(link => {
                link.style.display = 'none';
            });
            // Mostrar enlaces de login y registro
            loginLinks.forEach(link => {
                link.style.display = '';
            });
            registerLinks.forEach(link => {
                link.style.display = '';
            });

            // Si intenta entrar al dashboard sin haber iniciado sesión, redirigir a login
            if (isDashboardPage) {
                window.location.href = 'login.html?error=auth_required';
            }
        }
    }

    // Ejecutar inmediatamente
    updateAuthNavigation();

    // ========================================================
    // 0. LÓGICA DEL BANNER DE COOKIES
    // ========================================================
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptCookieBtn = document.getElementById('accept-cookie-btn');

    // Comprobar si el usuario ya aceptó las cookies
    if (!localStorage.getItem('glauncher_cookies_accepted')) {
        cookieBanner?.classList.add('visible');
    }

    acceptCookieBtn?.addEventListener('click', () => {
        // Guardar la preferencia en localStorage
        localStorage.setItem('glauncher_cookies_accepted', 'true');
        // Ocultar el banner
        cookieBanner.classList.remove('visible');
    });


    // ========================================================
    // 1. SISTEMA DE CARGA, NOTIFICACIONES Y OFFLINE
    // ========================================================

    // --- Lógica del Spinner de Carga ---
    const loader = document.getElementById('loader-overlay');
    if (loader) {
        window.addEventListener('load', () => {
            loader.classList.add('hidden');
            // Eliminar el loader del DOM después de la transición para mejorar el rendimiento
            setTimeout(() => {
                loader.remove();
            }, 500);
        });
    }

    // --- Lógica de la Pantalla de Desconexión ---
    const offlineOverlay = document.getElementById('offline-overlay');
    
    function updateOnlineStatus() {
        if (navigator.onLine) {
            offlineOverlay?.classList.remove('visible');
        } else {
            offlineOverlay?.classList.add('visible');
        }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus(); // Comprobar estado al cargar la página

    // --- Sistema Global de Notificaciones Flotantes ---
    window.showNotification = (message, type = 'info') => {
        const container = document.getElementById('notification-container');
        if (!container) {
            console.error("Contenedor de notificaciones no encontrado");
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };

        notification.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> <span>${message}</span>`;
        
        container.appendChild(notification);

        // Eliminar la notificación del DOM después de que termine la animación
        setTimeout(() => {
            notification.remove();
        }, 5000); // 5 segundos (4.5s de animación + 0.5s de margen)
    };


    // ========================================================
    // 2. EFECTOS DE SONIDO GLOBALES
    // ========================================================

    // Quitar la clase de carga para activar la animación de entrada
    document.body.classList.remove('is-loading');

    // 1. Crear el elemento de audio para el sonido de clic de forma dinámica
    const isSubdir = window.location.pathname.toLowerCase().includes('/src/html/') || window.location.pathname.toLowerCase().includes('\\src\\html\\');
    const soundPath = isSubdir ? '../assets/sounds/click_sound.mp3' : 'src/assets/sounds/click_sound.mp3';
    let clickSound = null;
    try {
        clickSound = new Audio(soundPath);
        clickSound.preload = 'auto';
        clickSound.volume = 0.4;
    } catch (e) {
        console.warn('Audio init error:', e);
    }

    // Función para reproducir el sonido
    const playClickSound = () => {
        if (!clickSound) return;
        clickSound.currentTime = 0;
        clickSound.play().catch(error => {
            // Ignorar bloqueo de autoplay del navegador
        });
    };

    // 2. Seleccionar todos los elementos que deben tener sonido de clic
    const clickableElements = document.querySelectorAll(`
        .auth-button,
        .download-button,
        .auth-button-action,
        .filter-button,
        .prog-tab-button,
        .tab-button,
        .social-login-button,
        .control-button
    `);

    // 3. Añadir el evento de clic a cada elemento
    clickableElements.forEach(element => {
        element.addEventListener('click', playClickSound);
    });

    // ========================================================
    // LÓGICA PARA MENSAJES DE LANZAMIENTO (../../index.html)
    // ========================================================

    let currentPage = 1;
    const BACKEND_URL = 'https://glauncher-api.onrender.com';
    const messagesPerPage = 10;

    // Palabras prohibidas (cliente-side para feedback inmediato)
    const FORBIDDEN_WORDS = {
        // Insultos fuertes y generales
        general: ["puta", "mierda", "cabron", "joder", "gilipollas", "coño", "polla", "verga", "pene", "cojones", "zorra", "maricon", "idiota", "estupido", "tonto", "retrasado", "subnormal", "imbecil"],
        // Insultos en inglés
        english: ["fuck", "shit", "bitch", "asshole", "cunt", "dick", "pussy", "bastard", "motherfucker", "nigger", "nigga"],
        // Variaciones y leetspeak (números por letras)
        leetspeak: {
            'a': '4', 'e': '3', 'i': '1', 'o': '0', 's': '5'
        }
    };

    function filterWordsClient(text) {
        let filteredText = text.toLowerCase(); // Convertir a minúsculas para la comparación

        // Crear un array con todas las palabras prohibidas
        const allForbiddenWords = [...FORBIDDEN_WORDS.general, ...FORBIDDEN_WORDS.english];

        allForbiddenWords.forEach(word => {
            // Crear variaciones con leetspeak
            let leetWord = word;
            for (const char in FORBIDDEN_WORDS.leetspeak) {
                leetWord = leetWord.replace(new RegExp(char, 'g'), `[${char}${FORBIDDEN_WORDS.leetspeak[char]}]`);
            }

            // Crear una expresión regular que busque la palabra original o su variación leet
            // \b no funciona bien con caracteres no alfanuméricos, así que lo construimos manualmente
            const regex = new RegExp(`(^|\\W)(${leetWord})($|\\W)`, 'gi');
            
            filteredText = filteredText.replace(regex, (match, p1, p2, p3) => {
                // Reemplazamos solo la palabra, manteniendo los espacios o signos de puntuación
                return p1 + '*'.repeat(p2.length) + p3;
            });
        });

        // Si se encontraron cambios, aplicamos la censura al texto original para mantener mayúsculas/minúsculas
        if (filteredText !== text.toLowerCase()) {
            // Esta es una forma simple de hacerlo, podría no ser perfecta para todas las mayúsculas
            return text.split('').map((char, index) => filteredText[index] === '*' ? '*' : char).join('');
        }

        return filteredText;
    }

    // Función para añadir un mensaje al DOM
    function addLaunchMessageToDOM(msg) {
        const launchMessagesList = document.getElementById('launch-messages-list');
        if (!launchMessagesList) return;

        const messageElement = document.createElement('div');
        messageElement.classList.add('launch-message-card');

        const date = new Date(msg.timestamp);
        const formattedDate = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        const formattedTime = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        messageElement.innerHTML = `
            <div class="message-header"><span class="message-username">${msg.username}</span><span class="message-timestamp">${formattedDate} ${formattedTime}</span></div>
            <p class="message-content">${msg.content}</p>
        `;
        // Si es la primera página, usamos prepend. Si no, append.
        if (currentPage === 1) {
            launchMessagesList.prepend(messageElement);
        } else {
            launchMessagesList.appendChild(messageElement);
        }
    }

    // Función para cargar los mensajes existentes
    async function loadLaunchMessages(page = 1) {
        const launchMessagesList = document.getElementById('launch-messages-list');
        const loadMoreContainer = document.getElementById('load-more-container');
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (!launchMessagesList) return;

        if (page === 1) {
            launchMessagesList.innerHTML = '<div class="launch-message-card system-message"><p>Cargando mensajes...</p></div>';
        } else {
            loadMoreBtn.disabled = true;
            loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/launch_messages?page=${page}&limit=${messagesPerPage}`);
            if (!response.ok) throw new Error('No se pudieron cargar los mensajes.');
            
            const { messages, has_more } = await response.json();
            if (page === 1) launchMessagesList.innerHTML = ''; // Limpiar el mensaje de carga solo en la primera página

            if (messages.length === 0) {
                launchMessagesList.innerHTML = '<div class="launch-message-card system-message"><p>¡Sé el primero en dejar un mensaje!</p></div>';
            } else {
                messages.forEach(msg => addLaunchMessageToDOM(msg));
            }
        } catch (error) {
            console.error("Error al cargar mensajes de lanzamiento:", error);
            launchMessagesList.innerHTML = '<div class="launch-message-card system-message error-message"><p>Error al cargar los mensajes.</p></div>';
        }
    }

    // Función para enviar un nuevo mensaje
    async function postLaunchMessage() {
        const usernameInput = document.getElementById('message-username');
        const messageContentInput = document.getElementById('launch-message-content');
        const postButton = document.getElementById('post-launch-message-btn');
        const warningText = document.getElementById('launch-message-warning');

        // Límite de mensajes
        let userMessagesCount = parseInt(localStorage.getItem('glauncher_wall_messages') || '0');
        if (userMessagesCount >= 3) {
            warningText.textContent = 'Has alcanzado el límite de 3 mensajes.';
            // Desactivar permanentemente el formulario para esta sesión
            usernameInput.disabled = true;
            messageContentInput.disabled = true;
            postButton.disabled = true;
            postButton.innerHTML = 'Límite alcanzado';
            return;
        }

        const username = usernameInput.value.trim();
        let content = messageContentInput.value.trim();

        if (!username) {
            warningText.textContent = 'Por favor, introduce tu nombre.';
            return;
        }
        if (!content) {
            warningText.textContent = 'El mensaje no puede estar vacío.';
            return;
        }

        // Filtrar palabras en el cliente para feedback inmediato
        const filteredContentClient = filterWordsClient(content);
        if (filteredContentClient !== content) {
            warningText.textContent = 'Tu mensaje contiene palabras inapropiadas y ha sido censurado.';
            content = filteredContentClient; // Enviar el contenido censurado
        } else {
            warningText.textContent = '';
        }

        postButton.disabled = true;
        postButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        try {
            const response = await fetch(`${BACKEND_URL}/api/launch_messages/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username: username, content: content })
            });
            const result = await response.json();

            if (!response.ok) throw new Error(result.message);

            // Recargamos la primera página para ver el nuevo mensaje al principio
            loadLaunchMessages(1);
            usernameInput.value = ''; // Limpiar campos
            messageContentInput.value = ''; // Limpiar input
            warningText.textContent = '¡Mensaje enviado con éxito!';
            warningText.style.color = 'var(--neon-green)';

            // Incrementar y guardar el contador de mensajes
            userMessagesCount++;
            localStorage.setItem('glauncher_wall_messages', userMessagesCount.toString());
        } catch (error) {
            console.error("Error al enviar mensaje de lanzamiento:", error);
            warningText.textContent = `Error al enviar mensaje: ${error.message}`;
            warningText.style.color = 'var(--neon-pink)';
        } finally {
            postButton.disabled = false;
            postButton.innerHTML = 'Enviar Mensaje';
        }
    }

    // Función de inicialización para ../../index.html
    async function initializeLaunchMessages() {
        const postButton = document.getElementById('post-launch-message-btn');
        const loadMoreBtn = document.getElementById('load-more-btn');
        const messageContentInput = document.getElementById('launch-message-content');
        const charCounter = document.getElementById('char-counter');
        const emojiBtn = document.getElementById('emoji-btn-wall');
        const pickerContainer = document.getElementById('picker-container-wall');
        const usernameInput = document.getElementById('message-username');

        // Comprobar el límite de mensajes al cargar la página
        let userMessagesCount = parseInt(localStorage.getItem('glauncher_wall_messages') || '0');
        if (userMessagesCount >= 3) {
            const warningText = document.getElementById('launch-message-warning');
            warningText.textContent = 'Has alcanzado el límite de 3 mensajes.';
            if (usernameInput) usernameInput.disabled = true;
            if (messageContentInput) messageContentInput.disabled = true;
            if (postButton) {
                postButton.disabled = true;
                postButton.innerHTML = 'Límite alcanzado';
            }
        }


        if (postButton) postButton.addEventListener('click', postLaunchMessage);

        // Lógica del contador de caracteres
        if (messageContentInput && charCounter) {
            messageContentInput.addEventListener('input', () => {
                const currentLength = messageContentInput.value.length;
                const maxLength = messageContentInput.maxLength;
                charCounter.textContent = `${currentLength}/${maxLength}`;
                charCounter.classList.toggle('limit-reached', currentLength >= maxLength);
            });
        }

        // Lógica del panel de emojis
        if (emojiBtn && pickerContainer) {
            emojiBtn.addEventListener('click', () => {
                pickerContainer.classList.toggle('visible');
            });

            pickerContainer.querySelector('emoji-picker').addEventListener('emoji-click', event => {
                messageContentInput.value += event.detail.unicode;
                pickerContainer.classList.remove('visible');
                messageContentInput.focus();
            });
        }

        if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => loadLaunchMessages(currentPage + 1));
        loadLaunchMessages(1); // Cargar la primera página de mensajes
    }

    // Ejecutar la inicialización solo si estamos en la página de inicio
    if (document.getElementById('community-wall-section')) {
        // --- CONFIGURACIÓN DE PUSHER PARA EL MURO ---
        const pusher = new Pusher('a2fb8d4323a44da53c63', { // Reemplazar 'default_key' con tu clave real de Pusher
            cluster: 'us2',
            encrypted: true
        });

        const wallChannel = pusher.subscribe('community_wall');
        wallChannel.bind('new_message', function(data) {
            addLaunchMessageToDOM(data.message);
        });

        initializeLaunchMessages();
    }
});