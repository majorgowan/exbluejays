require("dotenv").config();
const fs = require("fs");
const path = require("path");
const nodemailer = require('nodemailer');
const {connectToDatabase, closeConnection} = require("../utils/db");
const Email = require('email-templates');
const {buildTables} = require("../utils/tables");
const {teamAbbMap} = require("../utils/mlb");
const argv = require('yargs')
    .option("render", {
        alias: "r",
        type: "boolean",
        default: "false",
        describe: "render the email but do not sent"
    })
    .option("destination", {
        alias: "d",
        type: "string",
        describe: "destination email address"
    }).argv;

const transporter = nodemailer.createTransport({
    host: process.env.MAILGUN_SMTP_SERVER,
    port: process.env.MAILGUN_SMTP_PORT,
    auth: {
        user: process.env.MAILGUN_SMTP_LOGIN,
        pass: process.env.MAILGUN_SMTP_PASSWORD
    }
});

const renderOnly = argv.render;
const destinationEmail = argv.destination;
const senderEmail = process.env.EMAIL_SENDER_ADDRESS;

async function send_emails() {

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
        "transport": transporter
    });

    const endDate = "2026-05-03";
    const endDateString = new Date(endDate).toLocaleDateString('en-US',
        {weekday: "long", month: "long", day: "numeric", timeZone: "UTC"}
    );

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

    const unsubscribe_url = `https://exbluejays.ca/unsubscribe?email=${destinationEmail}`;

    const locals = {
        "email_address": destinationEmail,
        "unsubscribe_url": unsubscribe_url,
        "hitters_week": hitters_week,
        "pitchers_week": pitchers_week,
        "hitters_ytd": hitters_ytd,
        "pitchers_ytd": pitchers_ytd,
        "endDateString": endDateString,
        "endDate": endDate,
        "teamAbbMap": teamAbbMap
    }

    if (renderOnly) {
        const html = await email.render("email", locals);

        fs.writeFile(`./output/email_${endDate}.html`, html, (err) => {
            if (err) console.error(err);
        });

    } else {

        // Render and send an email
        await email.send({
            template: "email",
            message: {
                "to": destinationEmail,
                "from": senderEmail,
                "subject": `Ex-Blue Jays report for ${endDateString}`,
                "headers": {
                    "List-Unsubscribe": unsubscribe_url,
                    "List-Unsubscribe-Post": 'List-Unsubscribe=One-Click'
                }
            },
            locals: locals
        });

    }

    await closeConnection();
}

send_emails();

