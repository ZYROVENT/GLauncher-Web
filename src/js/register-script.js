document.addEventListener('DOMContentLoaded', () => {
    const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : 'https://glauncher-api.onrender.com';
    const registerForm = document.getElementById('register-form');
    const supabaseClient = window.glauncherSupabase;

    // Toggle de visibilidad para contraseñas
    const setupToggle = (toggleId, inputId) => {
        const toggle = document.getElementById(toggleId);
        const input = document.getElementById(inputId);
        if (toggle && input) {
            toggle.addEventListener('click', () => {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                toggle.classList.toggle('fa-eye', !isPassword);
                toggle.classList.toggle('fa-eye-slash', isPassword);
            });
        }
    };
    setupToggle('toggle-reg-password', 'reg-password');
    setupToggle('toggle-confirm-password', 'confirm-password');

    // Medidor de fortaleza de contraseña
    const passwordInput = document.getElementById('reg-password');
    const strengthBar = document.getElementById('password-strength-bar');

    if (passwordInput && strengthBar) {
        passwordInput.addEventListener('input', () => {
            const val = passwordInput.value;
            strengthBar.className = 'password-strength-bar';
            if (!val) {
                strengthBar.style.width = '0%';
                return;
            }

            let score = 0;
            if (val.length >= 6) score++;
            if (val.length >= 8) score++;
            if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
            if (/\d/.test(val)) score++;
            if (/[^A-Za-z0-9]/.test(val)) score++;

            if (score <= 2) {
                strengthBar.classList.add('strength-weak');
            } else if (score <= 4) {
                strengthBar.classList.add('strength-medium');
            } else {
                strengthBar.classList.add('strength-strong');
            }
        });
    }

    // ========================================================
    // GENERADOR DE CAPTCHA PROPIO GLAUNCHER (CANVAS + DISTORSIÓN)
    // ========================================================
    const regCanvas = document.getElementById('reg-captcha-canvas');
    const regRefreshBtn = document.getElementById('reg-refresh-captcha');
    const regCaptchaInput = document.getElementById('reg-captcha-input');
    let currentRegCaptcha = '';

    function generateCustomCaptcha(canvas) {
        if (!canvas) return '';
        const ctx = canvas.getContext('2d');
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Sin O, 0, 1, I para evitar confusión
        let text = '';
        for (let i = 0; i < 5; i++) {
            text += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Limpiar y fondo
        ctx.fillStyle = '#090d14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Líneas de interferencia neón
        const colors = ['#00f3ff', '#ff00ff', '#39ff14', '#f1c40f'];
        for (let i = 0; i < 4; i++) {
            ctx.strokeStyle = colors[i % colors.length];
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
            ctx.bezierCurveTo(
                Math.random() * canvas.width, Math.random() * canvas.height,
                Math.random() * canvas.width, Math.random() * canvas.height,
                Math.random() * canvas.width, Math.random() * canvas.height
            );
            ctx.stroke();
        }

        // Puntos de ruido
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.beginPath();
            ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // Dibujar cada carácter con rotación y sombras neón
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const x = 25 + i * 38;
            const y = 32 + (Math.random() * 6 - 3);
            const angle = (Math.random() * 30 - 15) * Math.PI / 180;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.font = 'bold 26px Consolas, monospace';
            ctx.fillStyle = colors[i % colors.length];
            ctx.shadowColor = colors[i % colors.length];
            ctx.shadowBlur = 8;
            ctx.fillText(char, -10, 0);
            ctx.restore();
        }

        return text;
    }

    if (regCanvas) {
        currentRegCaptcha = generateCustomCaptcha(regCanvas);
        regRefreshBtn?.addEventListener('click', () => {
            currentRegCaptcha = generateCustomCaptcha(regCanvas);
            if (regCaptchaInput) regCaptchaInput.value = '';
            regCaptchaInput?.focus();
        });
    }

    // Configurar enlaces OAuth dinámicos para que vuelvan al frontend correcto
    const btnGoogle = document.getElementById('btn-reg-google');
    const btnMicrosoft = document.getElementById('btn-reg-microsoft');
    const currentOrigin = window.location.origin;

    if (btnGoogle) {
        btnGoogle.href = `${BACKEND_URL}/login/google?return_to=${encodeURIComponent(currentOrigin)}`;
    }
    if (btnMicrosoft) {
        btnMicrosoft.href = `${BACKEND_URL}/login/microsoft?return_to=${encodeURIComponent(currentOrigin)}`;
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('reg-username').value.trim();
            const email = (document.getElementById('reg-email')?.value || '').trim();
            const password = document.getElementById('reg-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            const securityCode = document.getElementById('security-code').value.trim();

            // --- Validaciones del lado del cliente ---
            const enteredCaptcha = (regCaptchaInput?.value || '').trim().toUpperCase();
            if (currentRegCaptcha && enteredCaptcha !== currentRegCaptcha) {
                window.showNotification('El código de verificación (Captcha) es incorrecto.', 'error');
                currentRegCaptcha = generateCustomCaptcha(regCanvas);
                if (regCaptchaInput) regCaptchaInput.value = '';
                regCaptchaInput?.focus();
                return;
            }
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                window.showNotification('Por favor, ingresa un correo electrónico válido.', 'error');
                return;
            }

            if (password !== confirmPassword) {
                window.showNotification('Las contraseñas no coinciden.', 'error');
                return;
            }

            if (password.length < 6) {
                window.showNotification('La contraseña debe tener al menos 6 caracteres.', 'error');
                return;
            }

            if (!/^\d{6}$/.test(securityCode)) {
                window.showNotification('El código de seguridad debe ser de 6 dígitos numéricos.', 'error');
                return;
            }

            const submitButton = registerForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando cuenta...';

            try {
                // Si Supabase está disponible, intentamos registrar o guardar metadata con email
                if (supabaseClient && email) {
                    try {
                        await supabaseClient.auth.signUp({
                            email: email,
                            password: password,
                            options: {
                                data: {
                                    username: username,
                                    security_code: securityCode
                                }
                            }
                        });
                    } catch (supaErr) {
                        console.warn('Supabase auth background registration notice:', supaErr);
                    }
                }

                // Registrar en la API principal de GLauncher
                const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: username,
                        email: email || undefined,
                        password: password,
                        security_code: securityCode
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    window.showNotification('¡Registro exitoso! Ya puedes iniciar sesión con tu cuenta.', 'success');
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 1800);
                } else {
                    throw new Error(data.message || 'Ocurrió un error durante el registro.');
                }

            } catch (error) {
                window.showNotification(error.message, 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.innerHTML = '<i class="fas fa-rocket"></i> Registrar y Jugar';
            }
        });
    }
});