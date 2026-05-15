require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {connectToDatabase, closeConnection} = require("../utils/db");
const Email = require('email-templates');
const {buildTables} = require("../utils/tables");
const {teamAbbMap} = require("../utils/mlb");
const argv = require('yargs')
    .option("render", {
        alias: "r",
        type: "boolean",
        default: false,
        describe: "render the email but do not sent"
    })
    .option("endDate", {
        type: "string",
        describe: "specify end date"
    })
    .option("destination", {
        alias: "d",
        type: "string",
        describe: "destination email address"
    }).argv;

const mailgun = require('mailgun-js')({
    apiKey: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN
});

const renderOnly = argv.render;
const destinationEmail = argv.destination;
const endDate = argv.endDate;
const senderEmail = process.env.EMAIL_SENDER_ADDRESS;
const businessAddress = process.env.BUSINESS_ADDRESS;
const endDateString = new Date(endDate).toLocaleDateString('en-US',
    {weekday: "long", month: "long", day: "numeric", timeZone: "UTC"}
);

async function sendEmails() {

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

    // get stats from Mongo
    const dbInstance = await connectToDatabase("exbluejays");

    const { hitters: hitters_week, pitchers: pitchers_week } = await buildTables(dbInstance, "stats", endDate);
    const { hitters: hitters_ytd, pitchers: pitchers_ytd } = await buildTables(dbInstance, "ytd", endDate);

    // only list the best 5 hitters and pitchers
    // TODO: create function to better select the best (including minimum games requirement)
    hitters_week.length = 5;
    pitchers_week.length = 5;
    hitters_ytd.length = 5;
    pitchers_ytd.length = 5;

    const unsubscribe_url = `https://exbluejays.ca/unsubscribe?emailAddress=${destinationEmail}`;

    const locals = {
        "email_address": destinationEmail,
        "business_address": businessAddress,
        "unsubscribe_url": unsubscribe_url,
        "hitters_week": hitters_week,
        "pitchers_week": pitchers_week,
        "hitters_ytd": hitters_ytd,
        "pitchers_ytd": pitchers_ytd,
        "endDateString": endDateString,
        "endDate": endDate,
        "teamAbbMap": teamAbbMap
    }

    // render the email
    const html = await email.render("email", locals);

    if (renderOnly) {

        console.log(`Writing e-mail to ./output/email_${endDate}.html`);
        fs.writeFile(`./output/email_${endDate}.html`, html, (err) => {
            if (err) console.error(err);
        });

    } else {

        console.log(`Sending e-mail to ${destinationEmail}`);

        const data = {
            "to": destinationEmail,
            "from": senderEmail,
            "subject": `Ex-Blue Jays report for ${endDateString}`,
            "html": html,
            "h:List-Unsubscribe": unsubscribe_url,
            "h:List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }

        await mailgun.messages().send(data, (error, body) => {
            if (error) console.error(error);
            else console.log(body);
        });

    }

    await closeConnection();
}

sendEmails();

