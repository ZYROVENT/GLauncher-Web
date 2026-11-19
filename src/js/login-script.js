document.addEventListener('DOMContentLoaded', () => {
    const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : 'https://glauncher-api.onrender.com';
    // Usamos el cliente global de Supabase (debe estar cargado previamente)
    const supabaseClient = window.glauncherSupabase;

    const loginForm = document.getElementById('login-form');
    const credentialsSection = document.getElementById('credentials-section');
    const codeEntrySection = document.getElementById('code-entry-section');
    
    const usernameInput = document.getElementById('username_login');
    const passwordInput = document.getElementById('password_login');
    const securityCodeInput = document.getElementById('security-code');
    const verifyCodeButton = document.getElementById('verify-code-button');
    const goBackLogin = document.getElementById('go-back-login');

    // ========================================================
    // GENERADOR DE CAPTCHA PROPIO GLAUNCHER (LOGIN)
    // ========================================================
    const loginCanvas = document.getElementById('login-captcha-canvas');
    const loginRefreshBtn = document.getElementById('login-refresh-captcha');
    const loginCaptchaInput = document.getElementById('login-captcha-input');
    let currentLoginCaptcha = '';

    function generateCustomCaptcha(canvas) {
        if (!canvas) return '';
        const ctx = canvas.getContext('2d');
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let text = '';
        for (let i = 0; i < 5; i++) {
            text += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        ctx.fillStyle = '#090d14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

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

        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.beginPath();
            ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 1, 0, Math.PI * 2);
            ctx.fill();
        }

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

    if (loginCanvas) {
        currentLoginCaptcha = generateCustomCaptcha(loginCanvas);
        loginRefreshBtn?.addEventListener('click', () => {
            currentLoginCaptcha = generateCustomCaptcha(loginCanvas);
            if (loginCaptchaInput) loginCaptchaInput.value = '';
            loginCaptchaInput?.focus();
        });
    }

    // Configurar enlaces OAuth dinámicos para que vuelvan al frontend correcto
    const btnGoogle = document.getElementById('btn-login-google');
    const btnMicrosoft = document.getElementById('btn-login-microsoft');
    const currentOrigin = window.location.origin;

    if (btnGoogle) {
        btnGoogle.href = `${BACKEND_URL}/login/google?return_to=${encodeURIComponent(currentOrigin)}`;
    }
    if (btnMicrosoft) {
        btnMicrosoft.href = `${BACKEND_URL}/login/microsoft?return_to=${encodeURIComponent(currentOrigin)}`;
    }

    // Asegurarnos de que solo se ejecute si el formulario de login existe en la página
    if (loginForm) {
        // --- Paso 1: Enviar credenciales (usuario y contraseña) ---
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Evitar el envío tradicional del formulario

            const username = usernameInput.value;
            const password = passwordInput.value;

            // Validación de Captcha propio
            const enteredCaptcha = (loginCaptchaInput?.value || '').trim().toUpperCase();
            if (currentLoginCaptcha && enteredCaptcha !== currentLoginCaptcha) {
                window.showNotification('El código de verificación (Captcha) es incorrecto.', 'error');
                currentLoginCaptcha = generateCustomCaptcha(loginCanvas);
                if (loginCaptchaInput) loginCaptchaInput.value = '';
                loginCaptchaInput?.focus();
                return;
            }

            // Desactivar el botón mientras se procesa
            const submitButton = credentialsSection.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

            try {
                const response = await fetch(`${BACKEND_URL}/api/auth/check_credentials`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    // Si las credenciales son correctas, pasamos al segundo paso
                    credentialsSection.style.display = 'none';
                    codeEntrySection.style.display = 'flex'; // Usar flex para que se muestre correctamente
                    securityCodeInput.focus(); // Poner el foco en el campo del código
                    window.showNotification('Credenciales correctas. Ingresa tu código de seguridad.', 'info');
                } else {
                    // Si hay un error (usuario no existe, contraseña incorrecta), lo mostramos
                    throw new Error(data.message || 'Error al verificar las credenciales.');
                }

            } catch (error) {
                window.showNotification(error.message, 'error');
            } finally {
                // Reactivar el botón
                submitButton.disabled = false;
                submitButton.innerHTML = '<i class="fas fa-chevron-right"></i> Continuar';
            }
        });

        // --- Paso 2: Verificar el código de seguridad y completar el login ---
        verifyCodeButton.addEventListener('click', async () => {
            const username = usernameInput.value;
            const password = passwordInput.value;
            const securityCode = securityCodeInput.value;

            if (securityCode.length !== 6) {
                window.showNotification('El código de seguridad debe tener 6 dígitos.', 'error');
                return;
            }

            verifyCodeButton.disabled = true;
            verifyCodeButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accediendo...';

            try {
                const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, security_code: securityCode })
                });

                const data = await response.json();

                if (response.ok) {
                    // ¡Login exitoso! Guardamos el token y redirigimos
                    localStorage.setItem('glauncher_token', data.token);                    
                    window.showNotification('¡Inicio de sesión exitoso! Redirigiendo...', 'success');
                    // Siempre redirigimos al dashboard. El dashboard se encargará de verificar
                    // si el registro está completo o no.
                    setTimeout(() => window.location.href = 'dashboard.html', 1500);

                } else {
                    throw new Error(data.message || 'Error en el inicio de sesión.');
                }

            } catch (error) {
                window.showNotification(error.message, 'error');
                verifyCodeButton.disabled = false;
                verifyCodeButton.innerHTML = 'Verificar y Acceder';
            }
        });

        // --- Funcionalidad del botón "Volver" ---
        if (goBackLogin) {
            goBackLogin.addEventListener('click', (e) => {
                e.preventDefault();
                codeEntrySection.style.display = 'none';
                credentialsSection.style.display = 'block';
                passwordInput.value = ''; // Limpiar contraseña por seguridad
                securityCodeInput.value = '';
            });
        }

        // --- Mejora UX: Permitir solo números en el código de seguridad ---
        securityCodeInput.addEventListener('input', () => {
            securityCodeInput.value = securityCodeInput.value.replace(/[^0-9]/g, '');
        });

        // --- Mejora UX: Enviar con "Enter" en el campo de código ---
        securityCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                verifyCodeButton.click();
            }
        });

        // --- Toggle de contraseña en login ---
        const toggleLoginPass = document.getElementById('toggle-password-login');
        if (toggleLoginPass && passwordInput) {
            toggleLoginPass.addEventListener('click', () => {
                const isPassword = passwordInput.type === 'password';
                passwordInput.type = isPassword ? 'text' : 'password';
                toggleLoginPass.classList.toggle('fa-eye', !isPassword);
                toggleLoginPass.classList.toggle('fa-eye-slash', isPassword);
            });
        }
    }

    // ========================================================
    // RECUPERACIÓN DE CONTRASEÑA (GMAIL + USERNAME + PIN)
    // ========================================================
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const resetPasswordForm = document.getElementById('reset-password-form');
    const cancelResetLink = document.getElementById('cancel-reset-link');
    const resetUsernameInput = document.getElementById('reset-username');
    const resetSecurityPinInput = document.getElementById('reset-security-pin');
    const resetEmailInput = document.getElementById('reset-email');
    const resetStepCodeArea = document.getElementById('reset-step-code-area');
    const resetTokenInput = document.getElementById('reset-token-input');
    const resetNewPasswordInput = document.getElementById('reset-new-password');
    const resetSubmitBtn = document.getElementById('reset-submit-btn');
    const toggleResetPass = document.getElementById('toggle-reset-password');

    let recoveryStage = 'request'; // 'request' o 'verify'

    // Restringir PIN de seguridad a solo números
    if (resetSecurityPinInput) {
        resetSecurityPinInput.addEventListener('input', () => {
            resetSecurityPinInput.value = resetSecurityPinInput.value.replace(/[^0-9]/g, '');
        });
    }

    // Toggle para nueva contraseña en reset
    if (toggleResetPass && resetNewPasswordInput) {
        toggleResetPass.addEventListener('click', () => {
            const isPassword = resetNewPasswordInput.type === 'password';
            resetNewPasswordInput.type = isPassword ? 'text' : 'password';
            toggleResetPass.classList.toggle('fa-eye', !isPassword);
            toggleResetPass.classList.toggle('fa-eye-slash', isPassword);
        });
    }

    if (forgotPasswordLink && resetPasswordForm && loginForm) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.style.display = 'none';
            resetPasswordForm.style.display = 'block';
            recoveryStage = 'request';
            if (resetStepCodeArea) resetStepCodeArea.style.display = 'none';
            if (resetSubmitBtn) resetSubmitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Código al Gmail';
            if (resetUsernameInput) resetUsernameInput.focus();
        });

        if (cancelResetLink) {
            cancelResetLink.addEventListener('click', (e) => {
                e.preventDefault();
                resetPasswordForm.style.display = 'none';
                loginForm.style.display = 'block';
                recoveryStage = 'request';
                resetPasswordForm.reset();
            });
        }

        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = (resetUsernameInput?.value || '').trim();
            const securityPin = (resetSecurityPinInput?.value || '').trim();
            const email = (resetEmailInput?.value || '').trim();

            if (!username) {
                window.showNotification('Por favor ingresa tu nombre de usuario.', 'error');
                return;
            }

            if (!securityPin || securityPin.length !== 6) {
                window.showNotification('El PIN de seguridad debe tener exactamente 6 dígitos.', 'error');
                return;
            }

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                window.showNotification('Por favor ingresa un correo electrónico Gmail válido.', 'error');
                return;
            }

            if (recoveryStage === 'request') {
                // Etapa 1: Validar datos y enviar código de recuperación al Gmail
                btnRequestEmailChange?.setAttribute('disabled', 'true');
                resetSubmitBtn.disabled = true;
                resetSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando código a Gmail...';

                try {
                    // Llamar directamente al backend de GLauncher que despacha el código por Nodemailer
                    const response = await fetch(`${BACKEND_URL}/api/auth/forgot_password`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            username, 
                            security_code: securityPin,
                            security_pin: securityPin,
                            email
                        })
                    });

                    const data = await response.json().catch(() => ({}));

                    if (!response.ok) {
                        throw new Error(data.message || 'Error al validar tus datos o enviar el correo.');
                    }

                    // Pasar a la Etapa 2: Ingresar código recibido en Gmail y nueva contraseña
                    recoveryStage = 'verify';
                    if (resetStepCodeArea) resetStepCodeArea.style.display = 'block';
                    if (resetTokenInput) resetTokenInput.focus();
                    if (resetNewPasswordInput) resetNewPasswordInput.required = true;
                    
                    resetSubmitBtn.innerHTML = '<i class="fas fa-key"></i> Guardar Nueva Contraseña';
                    window.showNotification(data.message || `¡Código enviado con éxito a ${email}! Revisa tu bandeja de entrada o spam.`, 'success');

                } catch (error) {
                    window.showNotification(error.message || 'Error al enviar el código de recuperación a tu Gmail.', 'error');
                } finally {
                    resetSubmitBtn.disabled = false;
                }

            } else {
                // Etapa 2: Validar el código recibido en Gmail y establecer la nueva contraseña
                const tokenCode = (resetTokenInput?.value || '').trim();
                const newPassword = resetNewPasswordInput?.value || '';

                if (!newPassword || newPassword.length < 6) {
                    window.showNotification('La nueva contraseña debe tener al menos 6 caracteres.', 'error');
                    return;
                }

                resetSubmitBtn.disabled = true;
                resetSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando contraseña...';

                try {
                    let updated = false;

                    // Si se proporcionó código y el cliente de Supabase está activo
                    if (supabaseClient && tokenCode) {
                        try {
                            const { data, error } = await supabaseClient.auth.verifyOtp({
                                email: email,
                                token: tokenCode,
                                type: 'recovery'
                            });
                            if (!error && data?.session) {
                                await supabaseClient.auth.updateUser({ password: newPassword });
                                updated = true;
                            }
                        } catch (supaErr) {
                            console.warn('Supabase OTP verification warning:', supaErr);
                        }
                    }

                    // Actualizar contraseña en el Backend principal de GLauncher
                    const resp = await fetch(`${BACKEND_URL}/api/auth/reset_password`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            username,
                            security_code: securityPin,
                            security_pin: securityPin,
                            email,
                            token: tokenCode,
                            new_password: newPassword
                        })
                    });

                    const result = await resp.json().catch(() => ({}));

                    if (resp.ok || updated) {
                        window.showNotification('¡Contraseña restablecida con éxito! Ya puedes iniciar sesión con tu nueva contraseña.', 'success');
                        setTimeout(() => {
                            resetPasswordForm.style.display = 'none';
                            loginForm.style.display = 'block';
                            resetPasswordForm.reset();
                            recoveryStage = 'request';
                            if (resetStepCodeArea) resetStepCodeArea.style.display = 'none';
                        }, 1800);
                    } else {
                        throw new Error(result.message || 'Código incorrecto o expirado. Verifica el código que llegó a tu Gmail.');
                    }
                } catch (error) {
                    window.showNotification(error.message, 'error');
                } finally {
                    resetSubmitBtn.disabled = false;
                    resetSubmitBtn.innerHTML = '<i class="fas fa-key"></i> Guardar Nueva Contraseña';
                }
            }
        });
    }
});