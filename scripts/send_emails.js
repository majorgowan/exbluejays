require("dotenv").config();
const path = require("path");
const {connectToDatabase, closeConnection} = require("../utils/db");
const Email = require('email-templates');
const {buildTables} = require("../utils/tables");
const {teamAbbMap} = require("../utils/mlb");

async function send_emails() {

    const email = new Email({
        "views": {
            "root": "views/",
            "options": {
                "extension": "ejs"
            }
        },
        "juiceResources": {
            "webResources": {
                "relativeTo": path.resolve("./public")
            }
        }
    });

    const endDate = "2026-05-03";
    const endDateString = new Date(endDate).toLocaleDateString('en-US',
        {weekday: "long", month: "long", day: "numeric", timeZone: "UTC"}
    );
    const statsType = "ytd";

    // get stats from Mongo
    const dbInstance = await connectToDatabase("exbluejays");

    const { hitters, pitchers } = await buildTables(dbInstance, statsType, endDate);

    const destination_email = "majorgowan@yahoo.com";
    const unsubscribe_url = `https://exbluejays.ca/unsubscribe?email=${destination_email}`;

    const html = await email.render("email",
        {
            "email_address": destination_email,
            "unsubscribe_url": unsubscribe_url,
            "hitters": hitters,
            "pitchers": pitchers,
            "endDate": endDateString,
            "teamAbbMap": teamAbbMap,
            "ytd": (statsType === "ytd")
        }
    )
    console.log(html);

    // // Render and send an email
    // await email.send({
    //     template: "email",
    //     message: {
    //         "to": destination_email,
    //         "from": "mark.fruman@yahoo.com",
    //         "subject": `Ex-Blue Jays report for ${endDate}`,
    //         "headers": {
    //             "List-Unsubscribe": unsubscribe_url,
    //             "List-Unsubscribe-Post": 'List-Unsubscribe=One-Click'
    //         }
    //     },
    //     locals: {
    //         "email_address": destination_email,
    //         "unsubscribe_url": unsubscribe_url
    //     }
    // });

    await closeConnection();
}

send_emails();

