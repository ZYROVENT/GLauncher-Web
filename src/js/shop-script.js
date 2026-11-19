document.addEventListener('DOMContentLoaded', () => {
    const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : 'https://glauncher-api.onrender.com';
    const token = localStorage.getItem('glauncher_token');

    // Elementos del usuario en la Tienda
    const gcoinAmountSpan = document.getElementById('gcoin-amount');
    const shopUserAvatar = document.getElementById('shop-user-avatar');
    const shopUsername = document.getElementById('shop-username');
    const shopUserRole = document.getElementById('shop-user-role');
    const shopAuthHint = document.getElementById('shop-auth-hint');

    // Elementos de Regalo Diario
    const dailyChestIcon = document.getElementById('daily-chest-icon');
    const claimDailyBtn = document.getElementById('claim-daily-btn');
    const dailyStatusText = document.getElementById('daily-status-text');

    // Elementos de la Ruleta
    const spinBtn = document.getElementById('spin-btn');
    const wheel = document.getElementById('roulette-wheel');
    const rouletteResult = document.getElementById('roulette-result');
    const spinSound = document.getElementById('roulette-spin-sound');
    const winSound = document.getElementById('roulette-win-sound');

    let currentBalance = 0;
    let currentRotation = 0;
    const todayStr = new Date().toDateString();

    // Helper para decodificar JWT localmente si la red está ocupada
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

    // Actualizar Saldo UI con animación numérica
    function updateGcoinDisplay(newAmount, animate = true) {
        const start = currentBalance;
        const end = Math.max(0, parseInt(newAmount) || 0);
        currentBalance = end;

        if (!animate || start === end) {
            if (gcoinAmountSpan) {
                gcoinAmountSpan.innerHTML = `${end.toLocaleString('es-ES')} <i class="fas fa-coins text-neon-green"></i>`;
            }
            return;
        }

        let startTimestamp = null;
        const duration = 1200;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const value = Math.floor(progress * (end - start) + start);
            if (gcoinAmountSpan) {
                gcoinAmountSpan.innerHTML = `${value.toLocaleString('es-ES')} <i class="fas fa-coins text-neon-green"></i>`;
            }
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                gcoinAmountSpan.innerHTML = `${end.toLocaleString('es-ES')} <i class="fas fa-coins text-neon-green"></i>`;
            }
        };
        window.requestAnimationFrame(step);
    }

    // Cargar Datos del Usuario desde la Base de Datos
    async function loadShopUserData() {
        if (!token) {
            if (shopAuthHint) shopAuthHint.style.display = 'block';
            if (shopUsername) shopUsername.textContent = 'Invitado';
            if (shopUserRole) shopUserRole.textContent = 'Sin Iniciar Sesión';
            updateGcoinDisplay(0, false);
            return;
        }

        if (shopAuthHint) shopAuthHint.style.display = 'none';

        // Decodificación inicial rápida
        const decoded = parseJwt(token);
        if (decoded) {
            if (shopUsername) shopUsername.textContent = decoded.username || 'Jugador';
            if (shopUserRole) shopUserRole.textContent = decoded.role || 'Jugador';
            if (shopUserAvatar) shopUserAvatar.src = `https://crafatar.com/avatars/${decoded.username || 'steve'}?size=100&overlay`;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/api/user_info`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const userData = await res.json();
                if (shopUsername) shopUsername.textContent = userData.username || 'Jugador';
                if (shopUserRole) shopUserRole.textContent = userData.role || 'Jugador';
                if (shopUserAvatar) {
                    shopUserAvatar.src = userData.avatar_url || userData.profile_picture_url || `https://crafatar.com/avatars/${userData.username}?size=100&overlay`;
                }
                updateGcoinDisplay(userData.gcoins || 0, false);
            }
        } catch (e) {
            console.warn("Aviso al cargar datos de usuario en la tienda:", e);
        }
    }

    // --- LÓGICA DEL REGALO DIARIO ---
    function initializeDailyReward() {
        const lastClaim = localStorage.getItem('lastDailyRewardClaim');
        if (lastClaim === todayStr) {
            markDailyRewardClaimed();
        }

        claimDailyBtn?.addEventListener('click', async () => {
            if (claimDailyBtn.disabled) return;

            if (!token) {
                if (window.showNotification) window.showNotification('Debes iniciar sesión para reclamar tu regalo.', 'warning');
                return;
            }

            claimDailyBtn.disabled = true;
            claimDailyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reclamando...';

            try {
                const res = await fetch(`${BACKEND_URL}/api/shop/claim_daily_reward`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Error al reclamar.');

                // Disparar confeti
                if (typeof confetti === 'function') {
                    confetti({
                        particleCount: 120,
                        spread: 80,
                        origin: { y: 0.6 },
                        colors: ['#00ff0a', '#00f3ff', '#ffd700']
                    });
                }

                markDailyRewardClaimed();
                if (window.showNotification) window.showNotification('🎁 ¡Has recibido +50 GCoins!', 'success');
                updateGcoinDisplay(data.new_balance !== undefined ? data.new_balance : currentBalance + 50, true);

            } catch (err) {
                // Fallback local en caso de que el backend remoto no esté conectado
                localStorage.setItem('lastDailyRewardClaim', todayStr);
                markDailyRewardClaimed();
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
                }
                if (window.showNotification) window.showNotification('🎁 ¡Has recibido +50 GCoins!', 'success');
                updateGcoinDisplay(currentBalance + 50, true);
            }
        });
    }

    function markDailyRewardClaimed() {
        localStorage.setItem('lastDailyRewardClaim', todayStr);
        if (dailyChestIcon) {
            dailyChestIcon.classList.remove('fa-gift');
            dailyChestIcon.classList.add('fa-box-open');
            dailyChestIcon.style.color = '#00ff0a';
        }
        if (dailyStatusText) dailyStatusText.textContent = '¡Ya reclamaste tu recompensa de hoy! Vuelve mañana.';
        if (claimDailyBtn) {
            claimDailyBtn.disabled = true;
            claimDailyBtn.innerHTML = '<i class="fas fa-check"></i> Reclamado Hoy';
            claimDailyBtn.style.opacity = '0.6';
        }
    }

    // --- LÓGICA DE LA RULETA DE LA SUERTE ---
    function initializeRoulette() {
        const lastSpin = localStorage.getItem('lastRouletteSpin');
        if (lastSpin === todayStr) {
            if (spinBtn) {
                spinBtn.disabled = true;
                spinBtn.innerHTML = '<i class="fas fa-clock"></i> Vuelve Mañana';
                spinBtn.style.opacity = '0.6';
            }
            if (rouletteResult) rouletteResult.textContent = 'Ya utilizaste tu giro diario.';
        }

        spinBtn?.addEventListener('click', async () => {
            if (spinBtn.disabled) return;

            if (!token) {
                if (window.showNotification) window.showNotification('Debes iniciar sesión para girar la ruleta.', 'warning');
                return;
            }

            spinBtn.disabled = true;
            spinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Girando...';
            if (rouletteResult) rouletteResult.textContent = '¡Probando tu suerte!';

            if (spinSound) {
                spinSound.currentTime = 0;
                spinSound.play().catch(() => {});
            }

            // Calcular rotación aleatoria (5 a 8 vueltas completas)
            const randomExtra = Math.floor(Math.random() * 360);
            const totalSpin = 2160 + randomExtra;
            currentRotation += totalSpin;

            if (wheel) {
                wheel.style.transform = `rotate(${currentRotation}deg)`;
            }

            // 6 segmentos de 60 grados
            const arrowAngle = (360 - (currentRotation % 360)) % 360;
            const segmentIndex = Math.floor(arrowAngle / 60);
            
            const prizes = [
                { name: "¡Ganaste 100 GCoins!", amount: 100, color: "var(--neon-pink)" },
                { name: "¡Ganaste 50 GCoins!", amount: 50, color: "var(--neon-blue)" },
                { name: "¡GRAN PREMIO: 500 GCoins!", amount: 500, color: "var(--neon-green)" },
                { name: "¡Mala suerte! 0 GCoins", amount: 0, color: "#facc15" },
                { name: "¡Ganaste 200 GCoins!", amount: 200, color: "#ff3333" },
                { name: "👑 ¡JACKPOT: 1,000 GCoins!", amount: 1000, color: "#ffffff" }
            ];
            const prize = prizes[segmentIndex] || prizes[0];

            // Esperar animación de giro (9 segundos)
            setTimeout(async () => {
                localStorage.setItem('lastRouletteSpin', todayStr);
                spinBtn.disabled = true;
                spinBtn.innerHTML = '<i class="fas fa-clock"></i> Vuelve Mañana';
                spinBtn.style.opacity = '0.6';

                if (rouletteResult) {
                    rouletteResult.textContent = prize.name;
                    rouletteResult.style.color = prize.color;
                }

                if (prize.amount > 0) {
                    if (winSound) {
                        winSound.currentTime = 0;
                        winSound.play().catch(() => {});
                    }
                    if (typeof confetti === 'function') {
                        confetti({
                            particleCount: 100,
                            spread: 70,
                            origin: { x: 0.7, y: 0.6 },
                            colors: ['#ffd700', '#00ff0a', '#ff007f']
                        });
                    }

                    try {
                        const res = await fetch(`${BACKEND_URL}/api/shop/spin_roulette`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ prize_amount: prize.amount })
                        });
                        const data = await res.json();
                        updateGcoinDisplay(data.new_balance !== undefined ? data.new_balance : currentBalance + prize.amount, true);
                    } catch (e) {
                        updateGcoinDisplay(currentBalance + prize.amount, true);
                    }
                }
            }, 9000);
        });
    }

    // Inicializar tienda
    loadShopUserData();
    initializeDailyReward();
    initializeRoulette();
});