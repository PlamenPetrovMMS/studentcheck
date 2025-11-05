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
	const data = sessionStorage.getItem('studentData');
	const safeJsonParse = safeJsonParse(data);

    console.log("Loaded student homepage with data:", safeJsonParse);

	const displayName = deriveDisplayName(safeJsonParse) || 'Student';
	if (nameEl) nameEl.textContent = displayName;
	if (fnEl) fnEl.textContent = safeJsonParse.facultyNumber || '—';

	// Wire up logout button
	const logoutBtn = document.getElementById('logoutBtn');
	if (logoutBtn) {
		logoutBtn.addEventListener('click', () => {
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


