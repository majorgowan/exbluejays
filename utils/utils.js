function lastSunday(endDate=null) {
    let endDateObj;
    if (endDate) {
        endDateObj = new Date(endDate);
    } else {
        endDateObj = new Date();
    }
    const day = endDateObj.getUTCDay();
    if (day === 0) {
        endDateObj.setUTCDate(endDateObj.getUTCDate() - 7);
    } else {
        endDateObj.setUTCDate(endDateObj.getUTCDate() - day);
    }
    return endDateObj;
}

module.exports = { lastSunday }