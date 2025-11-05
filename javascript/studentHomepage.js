function safeJsonParse(str) {
    try { return JSON.parse(str); } catch { return null; }
}

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
	const raw = sessionStorage.getItem('studentData');
	if (!raw) {
		// No session data: send user back to login
		window.location.replace('studentLogin.html');
		return;
	}

	const parsed = safeJsonParse(raw);
	console.log("Loaded student homepage with data:", parsed);

	// Elements to update
	const nameEl = document.getElementById('studentDisplayName');
	const fnEl = document.getElementById('studentFacultyNumber');

	// Try to locate the student/user object in common shapes
	const studentData = (
		parsed.student
	);

	// Determine a reasonable display name
	const displayName = deriveDisplayName(parsed) ||
		[studentData.firstName || studentData.firstname || studentData.first_name,
		 studentData.lastName || studentData.lastname || studentData.last_name]
			.filter(Boolean).join(' ').trim() || 'Student';

	if (nameEl) nameEl.textContent = displayName;
	const facultyNumber = studentData.facultyNumber || parsed.facultyNumber || studentData.faculty_number || '—';
	if (fnEl) fnEl.textContent = facultyNumber;

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


