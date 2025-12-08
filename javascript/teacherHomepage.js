






// New Class button event listener

const newClassBtn = document.getElementById("newClassBtn");
newClassBtn.addEventListener("click", function() {
    openNewClassOverlay();
});

function openNewClassOverlay() {
    const overlay = document.getElementById("createClassOverlay");
    overlay.style.display = "block";
}