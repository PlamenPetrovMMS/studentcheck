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
	console.log("Parsed message:", parsedData.data.message);
	console.log("Parsed student data:", parsedData.data.student);
	console.log("Parsed loginSuccess:", parsedData.data.loginSuccess);

	// Elements to update
	const nameElement = document.getElementById('studentDisplayName');
	const facultyNumberElement = document.getElementById('studentFacultyNumber');

	// Try to locate the student/user object in common shapes
	const studentData = JSON.parse(parsedData.student);
	console.log("Extracted student data:", studentData);

	// Determine a reasonable display name
	const displayName = deriveDisplayName(parsedData) ||
		[studentData.firstName || studentData.firstname || studentData.first_name,
		 studentData.lastName || studentData.lastname || studentData.last_name]
			.filter(Boolean).join(' ').trim() || 'Student';

	if (nameElement) nameElement.textContent = displayName;
	const facultyNumber = studentData.facultyNumber || parsed.facultyNumber || studentData.faculty_number || '—';
	if (facultyNumberElement) facultyNumberElement.textContent = facultyNumber;

	// Wire up logout button
	const logoutBtn = document.getElementById('logoutBtn');
	if (logoutBtn) {
		logoutBtn.addEventListener('click', () => {
			sessionStorage.removeItem('studentData');
			sessionStorage.removeItem('studentAuth');
			window.location.replace('index.html');
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


