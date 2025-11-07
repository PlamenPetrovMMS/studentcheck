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
        // Collect all user data from localStorage
        const user = {
            first_name: localStorage.getItem('first_name'),
            last_name: localStorage.getItem('last_name'),
            email: localStorage.getItem('email'),
            faculty_number: localStorage.getItem('faculty_number'),
            studies_number: localStorage.getItem('studies_number'),
            role: localStorage.getItem('role')
        };
        // Remove undefined/null fields
        Object.keys(user).forEach(key => {
            if (user[key] === null || user[key] === undefined) {
                delete user[key];
            }
        });
        const qrData = JSON.stringify(user);
        new QRCode(qrContainer, {
            text: qrData,
            width: 256,
            height: 256,
        });
    }
});


