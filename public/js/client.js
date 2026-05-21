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