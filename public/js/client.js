function changeEndDate() {
    const select = document.getElementById("dateSelect");
    const url = new URL(window.location.href);
    url.searchParams.set('endDate', select.value);
    window.location.href = url.toString();
}
