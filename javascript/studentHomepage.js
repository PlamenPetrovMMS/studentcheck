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
	if (qrContainer) {
		qrContainer.innerHTML = '';

		// Build compact payload with short keys to reduce size
		const payload = {
			n: displayName,
			fn: facultyNumber,
			em: studentData.email || studentData.mail || undefined
		};
		Object.keys(payload).forEach(k => { if (!payload[k]) delete payload[k]; });

		const qrData = JSON.stringify(payload);
		console.log('QR payload:', payload, 'length:', qrData.length);

		function generateQr(dataStr) {
			for (let typeNum = 1; typeNum <= 40; typeNum++) {
				try {
					const qr = qrcode(typeNum, 'L');
					qr.addData(dataStr);
					qr.make();
					return qr.createSvgTag({ scalable: true });
				} catch (err) {
					if (typeNum === 40) throw err;
				}
			}
		}

		let svgTag;
		try {
			svgTag = generateQr(qrData);
		} catch (overflow) {
			console.warn('Overflow with full payload, falling back:', overflow);
			const fallback = JSON.stringify({ fn: facultyNumber });
			try { svgTag = generateQr(fallback); } catch (fallbackErr) { console.error('Fallback failed:', fallbackErr); }
		}

		if (svgTag) {
			qrContainer.innerHTML = svgTag;
		} else {
			qrContainer.innerHTML = '<p style="color:red;">Unable to generate QR code</p>';
		}
	}
});


