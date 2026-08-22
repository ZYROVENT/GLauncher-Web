document.addEventListener('DOMContentLoaded', () => {
    const BACKEND_URL = 'https://glauncher-api.onrender.com';
    // Usamos el cliente global de Supabase (debe estar cargado previamente)
    const supabaseClient = window.glauncherSupabase;

    const loginForm = document.getElementById('login-form');
    const credentialsSection = document.getElementById('credentials-section');
    const codeEntrySection = document.getElementById('code-entry-section');
    
    const usernameInput = document.getElementById('username_login');
    const passwordInput = document.getElementById('password_login');
    const securityCodeInput = document.getElementById('security-code');

    const verifyCodeButton = document.getElementById('verify-code-button');
    const goBackButton = document.getElementById('go-back-login');

    // Asegurarnos de que solo se ejecute si el formulario de login existe en la página
    if (loginForm) {
        // --- Paso 1: Enviar credenciales (usuario y contraseña) ---
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Evitar el envío tradicional del formulario

            const username = usernameInput.value;
            const password = passwordInput.value;

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
        goBackButton.addEventListener('click', (e) => {
            e.preventDefault();
            codeEntrySection.style.display = 'none';
            credentialsSection.style.display = 'block';
            passwordInput.value = ''; // Limpiar contraseña por seguridad
            securityCodeInput.value = '';
        });

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
    }
});