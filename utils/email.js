const Email = require('email-templates');
const path = require("path");

const mailgun = require('mailgun-js')({
    apiKey: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN
});


const email = new Email({
    "views": {
        "root": "views/",
        "options": {
            "extension": "ejs"
        }
    },
    "juice": true,
    "juiceResources": {
        "applyStyleTags": true,
        "webResources": {
            "relativeTo": path.resolve("./public")
        }
    },
    "send": false
});


async function renderEmail(template, locals) {
    return await email.render(template, locals);
}


async function sendEmail(data) {

    await mailgun.messages().send(data, (error, body) => {
        if (error) console.error(error);
        else console.log(body);
    });

}

module.exports = { renderEmail, sendEmail };