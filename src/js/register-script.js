document.addEventListener('DOMContentLoaded', () => {
    const BACKEND_URL = 'https://glauncher-api.onrender.com';
    const registerForm = document.getElementById('register-form');

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('reg-username').value;
            const password = document.getElementById('reg-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            const securityCode = document.getElementById('security-code').value;

            // --- Validaciones del lado del cliente ---
            if (password !== confirmPassword) {
                window.showNotification('Las contraseñas no coinciden.', 'error');
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
                // Usamos el endpoint correcto que debes tener en tu backend: /api/auth/register
                const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: username,
                        password: password,
                        security_code: securityCode
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    window.showNotification('¡Registro exitoso! Ahora inicia sesión.', 'success');
                    // Redirigir al login después de un registro exitoso
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);
                } else {
                    // Mostrar el mensaje de error que viene del backend
                    throw new Error(data.message || 'Ocurrió un error durante el registro.');
                }

            } catch (error) {
                window.showNotification(error.message, 'error');
            } finally {
                // Reactivar el botón
                submitButton.disabled = false;
                submitButton.innerHTML = '<i class="fas fa-rocket"></i> Registrar y Jugar';
            }
        });
    }
});