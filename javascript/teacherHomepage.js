// Add click logging when user clicks an item in the UL with the addClassBtn inside teacherHomepage.html
document.addEventListener('DOMContentLoaded', () => {
	document.getElementById('addClassBtn')?.addEventListener('click', () => {
        console.log("Add Class button clicked.");
        var ul = document.getElementById("classList");
        var li = document.createElement("li");
        li.textContent = "New Class Item";
        ul.appendChild(li);
    });
});

