// Enforce digits-only input for faculty number
const facultyInput = document.getElementById('facultyNumber');
if (facultyInput) {
    facultyInput.addEventListener('input', () => {
        const before = facultyInput.value;
        facultyInput.value = before.replace(/\D+/g, '');
        // Clear any previous custom error when user corrects input
        if (/^\d+$/.test(facultyInput.value)) {
            facultyInput.setCustomValidity('');
        }
    });
}

document.getElementById('registrationForm')?.addEventListener('submit', async function (event) {
    event.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const middleName = document.getElementById('middleName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const facultyNumber = document.getElementById('facultyNumber').value.trim();
    const password = document.getElementById('password').value;

    // Validate faculty number again on submit
    if (!/^\d+$/.test(facultyNumber)) {
        if (facultyInput) {
            facultyInput.setCustomValidity('Faculty number must contain digits only');
            facultyInput.reportValidity();
            facultyInput.focus();
        }
        return;
    }

    facultyInput?.setCustomValidity('');

    const user = { firstName, middleName, lastName, email, facultyNumber, password };

    const result = await fetch("https://studentcheck-server.onrender.com/registration", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(user)
    });

    if (result.ok) {
        const data = await result.json();
        console.log('Registration successful:', data);
    } else {
        console.error('Registration failed:', result.statusText);
    }

    console.log('Registration attempt:', user);

});