function deriveDisplayName(loginData) {
	if (!loginData) return null;
	// Try common locations for a name
	const sources = [
		loginData.data?.student,
		loginData.data?.user,
		loginData.data,
	];

	for (const src of sources) {
		if (!src || typeof src !== 'object') continue;
		const first = src.firstName || src.firstname || src.first_name || src.givenName;
		const last = src.lastName || src.lastname || src.last_name || src.familyName;
		const name = src.name || src.fullName || src.full_name;
		if (name) return String(name);
		if (first || last) return [first, last].filter(Boolean).join(' ').trim();
	}
	return null;
}

document.addEventListener('DOMContentLoaded', () => {
	// Try both keys that might be used by the login flow
	const rawData = sessionStorage.getItem('studentData');

	if (!rawData) {
		// No session data: send user back to login
		window.location.replace('studentLogin.html');
		return;
	}

	const parsedData = JSON.parse(rawData);
	const studentData = parsedData.data.student;

	// Elements to update
	const nameElement = document.getElementById('studentDisplayName');
	const facultyNumberElement = document.getElementById('studentFacultyNumber');

	// Determine a reasonable display name
	const displayName = studentData.fullName || "Error: No Name Found";
	const facultyNumber = studentData.facultyNumber || '—';

	if (nameElement) nameElement.textContent = displayName;
	if (facultyNumberElement) facultyNumberElement.textContent = facultyNumber;

	// Wire up logout button
	const logoutBtn = document.getElementById('logoutBtn');
	if (logoutBtn) {
		logoutBtn.addEventListener('click', () => {
			sessionStorage.removeItem('studentData');
			window.location.replace('studentLogin.html');
		});
	}

    const qrContainer = document.getElementById('qrContainer');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        
        // Debug: log the student data to see what's available
        console.log('Student data for QR code:', studentData);
        console.log('Full parsed data:', parsedData);
        
        // Collect user data from the actual student object
        const user = {
            fullName: studentData.fullName,
			facultyNumber: studentData.facultyNumber,
			email: studentData.email
        };
        
        // Remove undefined/null/empty fields
        Object.keys(user).forEach(key => {
            if (user[key] === null || user[key] === undefined || user[key] === '') {
                delete user[key];
            }
        });
        
        console.log('QR code data:', user);
        const qrData = JSON.stringify(user);
        console.log('QR code string:', qrData);
        
        if (Object.keys(user).length === 0) {
            qrContainer.innerHTML = '<p style="color: red;">No student data available for QR code</p>';
        } else {
            new QRCode(qrContainer, {
                text: qrData,
                width: 256,
                height: 256,
            });
        }
    }
});


