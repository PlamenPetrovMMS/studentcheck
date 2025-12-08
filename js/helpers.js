// Utility functions used across the project
window.helpers = {
	formatDateTime: function(ms) {
		if (!ms && ms !== 0) return '';
		const d = new Date(ms);
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		const hh = String(d.getHours()).padStart(2, '0');
		const mi = String(d.getMinutes()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
	},
	sortAttendanceEntries: function(entries) {
		entries.sort((a, b) => {
			const aDate = new Date(a.joinedAt);
			const bDate = new Date(b.joinedAt);
			const diff = aDate - bDate;
			if (diff !== 0) return diff;
			return (a.studentName || '').localeCompare(b.studentName || '');
		});
		return entries;
	},
	buildWorksheetData: function(entries) {
		const header = ['Student Name', 'Faculty Number', 'Joined Time', 'Left Time'];
		return [header, ...entries.map(e => [
			e.studentName,
			e.facultyNumber,
			window.helpers.formatDateTime(e.joinedAt),
			window.helpers.formatDateTime(e.leftAt)
		])];
	}
};
// Utility functions used across the project
// Exported functions will be added after extraction from teacherHomepage.js
