const serverBaseUrl = 'https://studentcheck-server.onrender.com';
const ENDPOINTS = {
        getStudentClasses: '/get_student_classes',
		getStudentClassesNamesbyIds: '/get_classes_names_by_ids',
		getStudentAttendanceCount: '/get_student_attendance_count',
		getClassIdByName: '/get_class_id_by_name',
	};


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
	const displayName = studentData.full_name || "Error: No Name Found";
	const facultyNumber = studentData.faculty_number || '---';

	if (nameElement) nameElement.textContent = displayName;
	if (facultyNumberElement) facultyNumberElement.textContent = facultyNumber;



	const classesBtn = document.getElementById('viewClassesBtn');
	if(classesBtn){
		classesBtn.addEventListener('click', async () => {

			openViewClassesOverlay();

			await loadClassesForStudent(studentData);

		});
	}


	const logoutBtn = document.getElementById('logoutBtn');
	if (logoutBtn) {
		logoutBtn.addEventListener('click', () => {

			sessionStorage.removeItem('studentData');
			// Redirect to the landing page after logout
			window.location.replace('index.html');

		});
	}else{
		console.error("Error: Unable to load logout button.");
	}


	const closeViewClassesOverlayBtn = document.getElementById('closeViewClassesOverlayBtn');
	if(closeViewClassesOverlayBtn){
		closeViewClassesOverlayBtn.addEventListener('click', () => {

			closeViewClassesOverlay();

		});
	}else{
		console.error("Error: Unable to load close overlay button.");
	}




	const closeClassDetailsOverlayBtn = document.getElementById('closeClassDetailsOverlayBtn');
	if(closeClassDetailsOverlayBtn){
		closeClassDetailsOverlayBtn.addEventListener('click', () => {

			closeClassDetailsOverlay();
			
		});
	}else{
		console.error("Error: Unable to load close class details overlay button.");
	}







	const qrContainer = document.getElementById('qrContainer');
	if (qrContainer && typeof kjua === 'function') {
		qrContainer.innerHTML = '';

		// Build compact payload with short keys to reduce size
		const payload = {
			name: studentData.full_name,
			facultyNumber: studentData.faculty_number,
			email: studentData.email
		};

		// remove empty fields
		Object.keys(payload).forEach(k => { if (!payload[k]) delete payload[k]; });

		let qrData = JSON.stringify(payload);
		console.log('QR (kjua) payload:', payload, 'length:', qrData.length);

			let kjuaData = kjua({
					render: 'svg',
					text: qrData,
					size: 256,
					quiet: 2,
					level: 'L'
			});
		
		if (kjuaData) {
			qrContainer.appendChild(kjuaData);
		} else {
			displayErrorInQRContainer(qrContainer, 'Unable to generate QR code');
		}

	} else if (qrContainer) {
		displayErrorInQRContainer(qrContainer, 'QR library not loaded');
	}


});

function displayErrorInQRContainer(qrContainer, message) {
	qrContainer.innerHTML = '';
	var errorParagraph = document.createElement('p');
	errorParagraph.style.color = 'red';
	errorParagraph.textContent = message;
	qrContainer.appendChild(errorParagraph);
}






// View Classes Overlay function =================================

function openViewClassesOverlay() {

	//console.log("[openClassesOverlay] Opening classes overlay...");

	const overlay = document.getElementById('view-classes-overlay');
	const overlayBackground = document.querySelector('.overlay-background');

	overlay.style.display = 'block';
	overlayBackground.style.visibility = 'visible';

}

function closeViewClassesOverlay() {
	const overlay = document.getElementById('view-classes-overlay');
	const overlayBackground = document.querySelector('.overlay-background');

	overlay.style.display = 'none';
	overlayBackground.style.visibility = 'hidden';
}

async function loadClassesForStudent(studentData) {

	//console.log("[loadClassesForStudent] Loading classes for student:", studentData);

	const classesList = document.getElementById('classesList');
	classesList.innerHTML = ''; // Clear previous list

	let classNames = [];

	var response = await fetch(serverBaseUrl + ENDPOINTS.getStudentClasses + `?student_id=${studentData.id}`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json'
		}
	});


	if (response.ok) {
		//console.log("[loadClassesForStudent] Response received from server.");
		const data = await response.json();

		//console.log("[loadClassesForStudent] Response data:", data);

		classNames = data.class_names;

		if(classNames.length > 0){

			classNames.forEach((className) => {
				const classItem = document.createElement('li');
				classItem.className = 'class-list-item';

				const btn = document.createElement('button');
				btn.className = 'class-button';
    			btn.textContent = className;
				
				btn.addEventListener('click', () => {

					openClassDetailsOverlay(className, studentData.id);

				});

				classItem.appendChild(btn);

				classesList.appendChild(classItem);
			});

			//console.log("[loadClassesForStudent] Classes loaded into overlay.");

		}else{
			classesList.innerHTML = '<p>No classes found.</p>';
		}
		
	}else{
		console.error("Error fetching classes:", response.status, response.statusText);
	}

}

// End of View Classes Overlay function ==========================




// Class Details Overlay functions ===============================

function openClassDetailsOverlay(className, studentId) {

	//console.log("[openClassDetailsOverlay] Opening details for class:", className);

	closeViewClassesOverlay();

	const overlay = document.getElementById('class-details-overlay');
	const background = document.querySelector('.overlay-background');

	overlay.style.display = 'block';
	background.style.visibility = 'visible';
	
	const classTitle = document.getElementById('classDetailsOverlayTitle');
	classTitle.textContent = `Class Details: ${className}`;

	loadAttendedClassesCount(className, studentId);

}

function closeClassDetailsOverlay(){
	const overlay = document.getElementById('class-details-overlay');
	const background = document.querySelector('.overlay-background');

	overlay.style.display = 'none';
	background.style.visibility = 'hidden';

	openViewClassesOverlay();

}

async function loadAttendedClassesCount(className, studentId){

	console.log("[loadAttendedClassesCount] Loading attended classes count for class:", className);

	const classId = await getClassIdByName(className);

	const response = await fetch(serverBaseUrl + ENDPOINTS.getStudentAttendanceCount + `?class_id=${encodeURIComponent(classId)}&student_id=${encodeURIComponent(studentId)}`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json'
		}
	});

	if(response.ok){
		
		console.log("[loadAttendedClassesCount] Response received from server for attendance data.");
		const data = await response.json();

		console.log(data);
		const attendance_count = data.attendance_count;
		const total_completed_classes_count = data.total_completed_classes_count;

		const attendanceCountElement = document.getElementById('attendedClassesCount');
		const totalClassesCountElement = document.getElementById('totalClassesCount'); 

		attendanceCountElement.textContent = attendance_count;
		totalClassesCountElement.textContent = total_completed_classes_count;

	}else{
		console.error("Error fetching attendance count:", response.status, response.statusText);
	}

}

// End of Class Details Overlay functions ========================

async function getClassIdByName(className){
	const response = await fetch(serverBaseUrl + ENDPOINTS.getClassIdByName + `?class_name=${encodeURIComponent(className)}`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json'
		}
	});

	if(response.ok){
		const data = await response.json();
		
		console.log("[getClassIdByName] Class ID for", className, "is", data.class_id, " type of: ", typeof data.class_id);

		return data.class_id;
	}
}




