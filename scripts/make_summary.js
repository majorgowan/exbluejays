require("dotenv").config();
const { connectToDatabase, closeConnection } = require("../utils/db");
const { buildPrompt, askCerebras } = require("../utils/cerebras");
const { buildTables } = require("../utils/tables");
const { buildSeries } = require("../utils/schedule");
const { lastSunday } = require("../utils/utils");
const argv = require('yargs')
    .option("endDate", {
        type: "string",
        describe: "specify end date"
    }).argv;

let endDate = argv.endDate;
if (endDate === undefined) {
    endDate = lastSunday().toISOString().split("T")[0];
}

async function makeSummary() {

    // const dbInstance = await connectToDatabase("exbluejays");
    //
    // // get stats from Mongo
    // const { hitters: hitters_week, pitchers: pitchers_week } = await buildTables(dbInstance, "stats", endDate);
    // const { hitters: hitters_ytd, pitchers: pitchers_ytd } = await buildTables(dbInstance, "ytd", endDate);
    //
    // // only list the best few hitters and pitchers
    // // sort pitchers by Runs Prevented
    // pitchers_week.sort((pa, pb) => {
    //     return pb.frumans - pa.frumans;
    // });
    // pitchers_ytd.sort((pa, pb) => {
    //    return pb.frumans - pa.frumans;
    // });
    //
    // // sort hitters by Runs Created
    // hitters_week.sort((ha, hb) => {
    //     return hb.runsCreated - ha.runsCreated;
    // });
    // hitters_ytd.sort((ha, hb) => {
    //     return hb.runsCreated - ha.runsCreated;
    // });
    //
    // hitters_week.length = 8;
    // pitchers_week.length = 8;
    // hitters_ytd.length = 8;
    // pitchers_ytd.length = 8;
    //
    // // get schedule for the week to come
    // const schedule = await buildSeries(dbInstance, endDate);
    //

    // await closeConnection();
    const prompt = buildPrompt();
    const summary = await askCerebras(prompt);
    console.log(summary);
}

makeSummary();
