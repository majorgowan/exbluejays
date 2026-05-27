function changeEndDate() {
    const select = document.getElementById("dateSelect");
    const url = new URL(window.location.href);
    url.searchParams.set('endDate', select.value);
    window.location.href = url.toString();
}

function changeYTD() {
    const tables = document.querySelectorAll(".exjaytable"); // Select all tables

    // Toggle class on all tables
    tables.forEach(table => {
        table.classList.toggle("showtable");
        table.classList.toggle("hidetable");
    });
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".newssummaryopen").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const visibleRow = e.target.closest("tr");
            const hiddenRow = visibleRow.nextElementSibling;
            if (hiddenRow.style.display !== "table-row") {
                // hide all hidden rows
                document.querySelectorAll(".exjaynewssummary").forEach(row => {
                   row.style.display = "none";
                });
                // show the hidden row below the link
                hiddenRow.style.display = "table-row"; //(hiddenRow.style.display === "none" ? "table-row" : "none");
                e.target.innerHTML = "&#9650";
            } else {
                // hide the hidden row below the link
                hiddenRow.style.display = "none"; //(hiddenRow.style.display === "none" ? "table-row" : "none");
                e.target.innerHTML = "&#9660";
            }
        });
    });
});