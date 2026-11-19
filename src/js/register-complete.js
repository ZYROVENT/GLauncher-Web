document.addEventListener('DOMContentLoaded', function () {
    const BACKEND_URL = 'https://glauncher-api.onrender.com';
    const NOTIFICATION_DURATION = 2000; // 2 segundos para las notificaciones
    
    // El script global-script.js ya se encarga de capturar el token de la URL y guardarlo.
    // Aquí solo necesitamos leerlo desde el localStorage.
    const tempToken = localStorage.getItem('glauncher_token');

    // Si no hay token, el usuario no debería estar aquí. Redirigir.
    if (!tempToken) {
        window.location.href = 'login.html?error=session_expired';
        return;
    }

    const form = document.getElementById('complete-registration-form');
    const profilePictureInput = document.getElementById('profile-picture-input');
    const usernameInput = document.getElementById('username');
    const profilePreview = document.getElementById('profile-preview');
    
    const steps = Array.from(document.querySelectorAll('.form-step'));
    const progressSteps = Array.from(document.querySelectorAll('.progress-step'));
    const nextButtons = document.querySelectorAll('.next-step-btn');
    const prevButtons = document.querySelectorAll('.prev-step-btn');
    let currentStep = 0;
    let isUsernameAvailable = false; // Variable para controlar la disponibilidad

    // --- Lógica de Validación de Nombre de Usuario en Tiempo Real ---
    async function checkUsernameAvailability() {
        const username = usernameInput.value;
        const errorElement = document.getElementById('username-error');
        errorElement.textContent = ''; // Limpiar error previo
        isUsernameAvailable = false;

        // Validación de formato y longitud
        if (username.length > 16) {
            errorElement.textContent = 'El nombre de usuario no puede tener más de 16 caracteres.';
            return;
        }
        if (/\s/.test(username)) {
            errorElement.textContent = 'El nombre de usuario no puede contener espacios.';
            return;
        }
        if (username.length < 3) {
            errorElement.textContent = 'El nombre de usuario debe tener al menos 3 caracteres.';
            return;
        }

        try {
            // Este endpoint debes crearlo en tu backend
            const response = await fetch(`${BACKEND_URL}/api/auth/check-username`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username })
            });
            const data = await response.json();
            if (!data.available) {
                errorElement.textContent = 'El nombre de usuario ya existe, selecciona otro.';
            } else {
                isUsernameAvailable = true;
            }
        } catch (error) {
            errorElement.textContent = 'No se pudo verificar el usuario. Intenta de nuevo.';
        }
    }

    usernameInput.addEventListener('blur', checkUsernameAvailability); // Se activa al salir del campo

    function updateStepView() {
        steps.forEach((step, index) => {
            step.classList.toggle('active', index === currentStep);
        });
        progressSteps.forEach((step, index) => {
            step.classList.toggle('active', index <= currentStep);
        });
    }

    function validateStep(stepIndex) {
        const step = steps[stepIndex];
        const inputs = step.querySelectorAll('input[required]');
        for (const input of inputs) {
            if (!input.value && input.type !== 'checkbox') {
                window.showNotification(`Por favor, completa el campo "${input.labels[0].innerText}".`, 'warning');
                return false;
            }
            if (input.type === 'checkbox' && !input.checked) {
                window.showNotification('Debes aceptar los Términos y Condiciones para continuar.', 'warning');
                return false;
            }
        }
        // Validación específica para el paso del nombre de usuario
        if (stepIndex === 0 && !isUsernameAvailable) {
            window.showNotification('El nombre de usuario no es válido o ya está en uso.', 'error');
            return false;
        }
        return true;
    }

    nextButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (validateStep(currentStep)) {
                currentStep++;
                updateStepView();
            }
        });
    });

    prevButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentStep--;
            updateStepView();
        });
    });

    profilePictureInput.addEventListener('change', function () {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                profilePreview.src = e.target.result;
            }
            reader.readAsDataURL(file);
        }
    });

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';

        const formData = new FormData();
        formData.append('username', document.getElementById('username').value);
        formData.append('password', document.getElementById('password').value);
        formData.append('security_code', document.getElementById('security-code').value); // Ajuste clave: enviar el código de seguridad del nuevo campo.

        if (profilePictureInput.files[0]) {
            formData.append('profile_picture', profilePictureInput.files[0]);
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/auth/complete_registration`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tempToken}`
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Ocurrió un error al completar el registro.');
            }

            // El backend nos da un nuevo token con la información actualizada (username, etc.)
            // Reemplazamos el token antiguo por el nuevo.
            localStorage.setItem('glauncher_token', data.token);

            window.showNotification(data.message, 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, NOTIFICATION_DURATION);

        } catch (error) {
            window.showNotification(`Error: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-rocket"></i> Finalizar Registro';
        }
    });

    updateStepView(); // Mostrar el primer paso al cargar la página
});