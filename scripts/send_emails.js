require("dotenv").config();
const fs = require("fs");
const { connectToDatabase, closeConnection } = require("../utils/db");
const { renderEmail, sendEmail } = require("../utils/email");
const { buildTables, buildSeries, buildSummary, buildNews} = require("../utils/builders");
const { lastSunday } = require("../utils/utils");
const { teamAbbMap } = require("../utils/mlb");
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
    })
    .option("Tuesday", {
        type: "boolean",
        default: false,
        describe: "only execute script if day is Tuesday"
    })
    .option("verbose", {
        alias: "v",
        type: "boolean",
        default: false,
        describe: "generate verbose output to console"
    }).argv;

const renderOnly = argv.render;
const destinationEmail = argv.destination;
let endDate = argv.endDate;
const tuesday = argv.Tuesday;
const verbose = argv.verbose;
const senderEmail = process.env.EMAIL_SENDER_ADDRESS;
const businessAddress = process.env.BUSINESS_ADDRESS;

if (tuesday && new Date().getDay() !== 2) {
    // quit abruptly if it isn't Tuesday
    if (verbose) console.log("Today is not Tuesday, quitting.");
    process.exit(0);
}

if (!endDate) {
    endDate = lastSunday().toISOString().split("T")[0];
    console.log(endDate);
}

const endDateString = new Date(endDate).toLocaleDateString('en-US',
    {weekday: "long", month: "long", day: "numeric", timeZone: "UTC"}
);


async function getAddresses(dbInstance) {
    // fetch from mongodb
    const subscribersCollection = await dbInstance.collection("subscribers");

    const subsArray = await subscribersCollection.find(
        {
            "active": true
        },
        {
            "projection": {
                "_id": 0,
                "email": 1
            }
        }
    ).toArray();

    return subsArray.map(subscriber => subscriber.email);
}


async function sendEmails() {

    const dbInstance = await connectToDatabase("exbluejays");

    // get stats from Mongo
    const { hitters: hitters_week, pitchers: pitchers_week } = await buildTables(dbInstance, "stats", endDate);
    const { hitters: hitters_ytd, pitchers: pitchers_ytd } = await buildTables(dbInstance, "ytd", endDate);

    // only list the best few hitters and pitchers
    // sort pitchers by Runs Prevented
    pitchers_week.sort((pa, pb) => {
        return pb.frumans - pa.frumans;
    });
    pitchers_ytd.sort((pa, pb) => {
       return pb.frumans - pa.frumans;
    });

    // sort hitters by Runs Created
    hitters_week.sort((ha, hb) => {
        return hb.runsCreated - ha.runsCreated;
    });
    hitters_ytd.sort((ha, hb) => {
        return hb.runsCreated - ha.runsCreated;
    });

    hitters_week.length = 6;
    pitchers_week.length = 6;
    hitters_ytd.length = 6;
    pitchers_ytd.length = 6;

    // get schedule for the week to come
    const schedule = await buildSeries(dbInstance, endDate);

    // get summary from reports
    const summary = await buildSummary(dbInstance, endDate);

    // get news roundup
    const news = await buildNews(dbInstance, endDate, 5);

    // URL to unsubscribe from EBJR
    const unsubscribe_url = `https://exbluejays.ca/unsubscribe?email=${destinationEmail}`;

    let emailList = [];
    if (destinationEmail) {
        // send to the address passed in
        emailList.push(destinationEmail);
    } else if (renderOnly) {
        emailList.push("subscriber@email.ca");
    } else {
        // fetch addresses from mongo
        emailList = await getAddresses(dbInstance);
    }

    for (const emailAddress of emailList) {

        const locals = {
            "email": emailAddress,
            "business_address": businessAddress,
            "unsubscribe_url": unsubscribe_url,
            "hitters_week": hitters_week,
            "pitchers_week": pitchers_week,
            "hitters_ytd": hitters_ytd,
            "pitchers_ytd": pitchers_ytd,
            "schedule": schedule,
            "summary": summary,
            "news": news,
            "endDateString": endDateString,
            "endDate": endDate,
            "teamAbbMap": teamAbbMap,
            "players_url": process.env.PLAYERS_URL
        }

        // render the email
        const html = await renderEmail("email", locals);

        if (renderOnly) {

            console.log(`Writing e-mail to ./output/email_${endDate}.html`);
            fs.writeFile(`./output/email_${endDate}.html`, html, (err) => {
                if (err) console.error(err);
            });

        } else {

            const data = {
                "to": emailAddress,
                "from": senderEmail,
                "subject": `Ex-Blue Jays report for ${endDateString}`,
                "html": html,
                "h:Reply-To": process.env.EMAIL_REPLYTO_ADDRESS,
                "h:List-Unsubscribe": unsubscribe_url,
                "h:List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
            }

            if (verbose) console.log(`Sending ${endDate} report to ${emailAddress}`);
            await sendEmail(data);
        }

    }

    await closeConnection();
}


sendEmails();
