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
	const raw = sessionStorage.getItem('studentAuth');
	const auth = safeJsonParse(raw);

	if (!auth) {
		// No session data: send user back to login
		window.location.replace('studentLogin.html');
		return;
	}

	const nameEl = document.getElementById('studentDisplayName');
	const fnEl = document.getElementById('studentFacultyNumber');

	const displayName = deriveDisplayName(auth) || 'Student';
	if (nameEl) nameEl.textContent = displayName;
	if (fnEl) fnEl.textContent = auth.facultyNumber || '—';

	// Wire up logout button
	const logoutBtn = document.getElementById('logoutBtn');
	if (logoutBtn) {
		logoutBtn.addEventListener('click', () => {
			sessionStorage.removeItem('studentAuth');
			window.location.replace('index.html');
		});
	}
});

