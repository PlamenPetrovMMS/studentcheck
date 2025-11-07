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

	var rawData = null;
	var parsedData = null;
	var studentData = null;

	var nameElement = null;
	var facultyNumberElement = null;

	try{

		rawData = sessionStorage.getItem('studentData');

		if (!rawData) {
			// No session data: send user back to login
			window.location.replace('studentLogin.html');
			return;
		}

		parsedData = JSON.parse(rawData);
		studentData = parsedData.data.student;

	}catch(e){
		console.error("Error during extracting data.", e);
		return;
	}

	if (!studentData) {
		console.error("No student data found in sessionStorage.");
		return;
	}
	
	try{

		nameElement = document.getElementById('studentDisplayName');
		facultyNumberElement = document.getElementById('studentFacultyNumber');

	}catch(e){
		console.error("Error during initializing page elements.", e);
		return;
	}

	if(nameElement == null || facultyNumberElement == null){
		console.error("Essential page elements are missing.");
		return;
	}

	// Determine a reasonable display name
	const displayName = studentData.fullName || "Error: No Name Found";
	const facultyNumber = studentData.facultyNumber || '---';

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
	if (qrContainer && typeof kjua === 'function') {
		qrContainer.innerHTML = '';

		// Build compact payload with short keys to reduce size
		const payload = {
			name: studentData.fullName,
			facultyNumber: studentData.facultyNumber,
			email: studentData.email
		};

		// remove empty fields
		Object.keys(payload).forEach(k => { if (!payload[k]) delete payload[k]; });

		let qrData = JSON.stringify(payload);
		console.log('QR (kjua) payload:', payload, 'length:', qrData.length);

		// kjua options: render as SVG for crisp scaling
		function makeKjua(dataStr) {
			return kjua({
				
			});
		}

		let kjuaData = kjua({
				render: 'svg',
				text: dataStr,
				size: 256,
				quiet: 2,
				level: 'L'
		});
		
		if (kjuaData) {
			qrContainer.appendChild(kjuaData);
		} else {
			qrContainer.innerHTML = '<p style="color:red;">Unable to generate QR code</p>';
		}
	} else if (qrContainer) {
		qrContainer.innerHTML = '<p style="color:red;">QR library not loaded</p>';
	}
});


