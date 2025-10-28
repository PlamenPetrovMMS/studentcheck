document.getElementById('teacherLoginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // Perform login logic here (e.g., send data to server)
    const teacherData = { email, password };

    console.log('Teacher Login Attempt:', teacherData);

    const response = await fetch("https://studentcheck-server.onrender.com/teacherLogin", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(teacherData)
    });

    if (response.ok) {
        const data = await response.json();
        if(data.loginSuccess) {
            alert('Login successful!');
            console.log('Login successful:', data);
            window.location.href = 'teacherHomepage.html';
        }else{
            alert('Login failed: ' + (data.message || 'Unknown error'));
        }
    } else {
        console.error('Login failed:', response.statusText);
    }
});