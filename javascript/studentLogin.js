// --- Login submit handler ---
document.getElementById('studentLoginForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const facultyNumber = document.getElementById('facultyNumber').value;
    const password = document.getElementById('password').value;

    const studentData = { facultyNumber, password };

    console.log('Student Login Attempt:', studentData);

    // Optional: measure request duration
    const t0 = performance.now();
    
    const response = await fetch("https://studentcheck-server.onrender.com/studentLogin", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(studentData)
    });

    const t1 = performance.now();
    console.log(`Response received from server in ${Math.round(t1 - t0)} ms`);

    if (response.ok) {
        const data = await response.json();
        console.log('Login successful:', data);
    } else {
        console.error('Login failed:', response.statusText);
    }

});