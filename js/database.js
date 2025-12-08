// Handles API/database interactions
window.database = {
	async loadClasses(serverBaseUrl, ENDPOINTS, teacherEmail) {
		let result = await fetch(`${serverBaseUrl + ENDPOINTS.createClass}?teacherEmail=${encodeURIComponent(teacherEmail)}`, {
			method: 'GET',
			headers: { 'Accept': 'application/json' }
		});
		result = await result.json();
		const classesMap = new Map();
		result.classes.forEach(_class => {
			classesMap.set(_class.id, _class.name);
		});
		localStorage.setItem('classesMap', JSON.stringify(Array.from(classesMap.entries())));
		return classesMap;
	},
	async loadStudentsFromDatabase(serverBaseUrl, ENDPOINTS) {
		let result = await fetch(`${serverBaseUrl + ENDPOINTS.students}`, {
			method: 'GET',
			headers: { 'Accept': 'application/json' }
		});
		if(result.ok){
			const data = await result.json();
			return data.students;
		}
		return [];
	},
	async addNewStudentsToDatabase(serverBaseUrl, ENDPOINTS, classId, newlyAddedStudents) {
		const response = await fetch(`${serverBaseUrl + ENDPOINTS.class_students}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ classId, students: newlyAddedStudents })
		});
		return response.ok;
	}
};
// Handles API/database interactions
// Exported functions will be added after extraction from teacherHomepage.js
