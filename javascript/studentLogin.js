// --- Login submit handler ---
document.getElementById('studentLoginForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const facultyNumber = document.getElementById('facultyNumber').value;
    const password = document.getElementById('password').value;

    const studentData = { facultyNumber, password };

    if(studentData.facultyNumber != "" && studentData.password != "") {
        console.log('Student Login Attempt:', studentData);
    }else{
        const errorMessage = document.getElementById('error-message');
        errorMessage.style.color = "red";
        errorMessage.textContent = "Faculty Number and Password are required."
        return;
    }

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
        if(data.loginSuccess) {
            // Store non-sensitive data for the homepage
            try {
                sessionStorage.setItem('studentAuth', JSON.stringify({
                    facultyNumber,
                    data
                }));
            } catch (e) {
                console.warn('Failed to persist session data:', e);
            }

            alert('Login successful!');
            console.log('Login successful:', data);
            window.location.href = 'studentHomepage.html';
        }else{
            alert('Login failed: ' + (data.message || 'Unknown error'));
        }
    } else {
        console.error('Login failed:', response.statusText);
    }

});