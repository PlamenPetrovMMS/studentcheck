console.log("teacherHomepage.js loaded");

loadNewClassButton();





// New Class button event listener

function loadNewClassButton() {
    const newClassBtn = document.getElementById("newClassBtn");

    if(!newClassBtn){

        console.error("newClassBtn button not found!");

    }else{

        newClassBtn.addEventListener("click", function() {
            openNewClassOverlay();
        });

    }
}

function openNewClassOverlay() {
    const overlay = document.getElementById("createClassOverlay");
    overlay.style.display = "block";
}