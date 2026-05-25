function lastSunday(endDate=null) {
    let endDateObj;
    if (endDate) {
        endDateObj = new Date(endDate);
    } else {
        endDateObj = new Date();
        endDateObj.setHours(0, 0, 0);
    }
    const day = endDateObj.getUTCDay();
    if (day === 0) {
        endDateObj.setUTCDate(endDateObj.getUTCDate() - 7);
    } else {
        endDateObj.setUTCDate(endDateObj.getUTCDate() - day);
    }
    return endDateObj;
}


function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


module.exports = { lastSunday, generateRandomString, sleep }