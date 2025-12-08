console.log("teacherHomepage.js loaded");

loadNewClassButton();





// New Class button event listener

function loadNewClassButton() {
    const newClassBtn = document.getElementById("newClassBtn");

    if(!newClassBtn){

        console.error("newClassBtn button not found!");

    }else{

        newClassBtn.addEventListener("click", function() {
            console.log("New Class button clicked");
            openNewClassOverlay();
        });

    }
}

function openNewClassOverlay() {
    
    console.log("Opening Create Class Overlay");

    const overlay = document.getElementById("createClassOverlay");
    overlay.style.display = "block";
}