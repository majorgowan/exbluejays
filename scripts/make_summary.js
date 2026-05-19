require("dotenv").config();
const { connectToDatabase, closeConnection } = require("../utils/db");
const { buildPrompt, askCerebras } = require("../utils/cerebras");
const { buildTables, buildSeries } = require("../utils/builders");
const { lastSunday } = require("../utils/utils");
const argv = require('yargs')
    .option("endDate", {
        type: "string",
        describe: "specify end date"
    })
    .option("testing", {
        type: "boolean",
        default: false,
        describe: "do not update mongo"
    })
    .option("verbose", {
        alias: "v",
        type: "boolean",
        default: false,
        describe: "generate verbose output to console"
    }).argv;

const verbose = argv.verbose;
const testing = argv.testing;

let endDate = argv.endDate;
if (endDate === undefined) {
    endDate = lastSunday().toISOString().split("T")[0];
}

async function makeSummary() {

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

    hitters_week.length = 8;
    pitchers_week.length = 8;
    hitters_ytd.length = 8;
    pitchers_ytd.length = 8;

    // get schedule for the week to come
    const schedule = await buildSeries(dbInstance, endDate);

    const prompt = buildPrompt(hitters_week, hitters_ytd, pitchers_week, pitchers_ytd,
                                     schedule);
    if (verbose) {
        console.log("Prompt: \n");
        console.log(prompt);
        console.log("\n\n");
    }

    const summary = await askCerebras(prompt);
    if (verbose) {
        console.log("summary: \n\n");
        console.log(summary);
    }

    if (!testing) {
        // update reports collection
        const reportsCollection = dbInstance.collection("reports");
        const reportsResult = await reportsCollection.updateOne(
            {
                "endDate": endDate
            },
            {
                "$set":
                    {
                        "summary": summary
                    }
            },
            {
                "upsert": true
            }
        );
        if (reportsResult.acknowledged) {
            if (verbose) console.log(reportsResult);
        }
    }

    await closeConnection();
}

makeSummary();
