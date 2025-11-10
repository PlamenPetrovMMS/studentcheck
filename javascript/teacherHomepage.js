// Add click logging when user clicks an item in the UL with the addClassBtn inside teacherHomepage.html
document.addEventListener('DOMContentLoaded', () => {
	const classList = document.getElementById('classList');

	if (!classList) return;

	// Event delegation: handle clicks on any <li> or its children
	classList.addEventListener('click', (event) => {
		const li = event.target.closest('li');
		if (!li || !classList.contains(li)) return;

		// If the click is on the "+" button (id addClassBtn) or within its LI
		if (event.target.id === 'addClassBtn' || li.querySelector('#addClassBtn')) {
			console.log('addClassBtn clicked');
			// You can add additional logic here later (e.g., open modal, add input, etc.)
		} else {
			console.log('Class list item clicked:', li.textContent?.trim());
		}
	});
});

