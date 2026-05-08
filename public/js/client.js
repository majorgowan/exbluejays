function changeEndDate() {
    const select = document.getElementById("dateSelect");
    const url = new URL(window.location.href);
    url.searchParams.set('endDate', select.value);
    window.location.href = url.toString();
}

function changeYTD() {
    const checkBox = document.getElementById("ytdCheckbox");
    const url = new URL(window.location.href);
    if (checkBox.checked) {
        url.searchParams.set('ytd', true);
    } else {
        url.searchParams.set('ytd', false);
    }
    window.location.href = url.toString();
}
