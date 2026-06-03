require("dotenv").config();
const { createInterface } = require("node:readline/promises");
const { connectToDatabase, closeConnection } = require("../utils/db");
const { buildPrompt, askCerebras } = require("../utils/cerebras");
const { buildTables, buildSeries, buildNews, buildTransactions} = require("../utils/builders");
const { lastSunday, sleep} = require("../utils/utils");
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
    .option("yes", {
        alias: "y",
        type: "boolean",
        default: false,
        describe: "do not ask for keyboard confirmation before committing to mongo"
    })
    .option("verbose", {
        alias: "v",
        type: "boolean",
        default: false,
        describe: "generate verbose output to console"
    }).argv;

const verbose = argv.verbose;
const testing = argv.testing;
const yes = argv.yes;

let endDate = argv.endDate;
if (endDate === undefined) {
    endDate = lastSunday().toISOString().split("T")[0];
}

// interface for accepting input (if not yes)
const rl = createInterface({ input: process.stdin, output: process.stdout });

async function makeCerebrasSummary(dbInstance) {

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

    // get news
    const news = await buildNews(dbInstance, endDate, 5);

    // get transactions
    const transactions = await buildTransactions(dbInstance, endDate);

    // construct prompt for Cerebras
    if (verbose) console.log(`Mister Ex composing report for week ending ${endDate}`);

    const prompt = buildPrompt(hitters_week, hitters_ytd, pitchers_week, pitchers_ytd,
                               schedule, news, transactions);
    if (verbose) {
        console.log("Prompt: \n");
        console.log(prompt);
        console.log("\n\n");
    }

    try {
        const response = await askCerebras(prompt, null, "medium", 8192);

        const summary = response.choices[0].message.content;

        if (!summary && verbose) {
            // something went wrong, print entire response object
            console.log(response);
            console.log(response.choices[0].message);
        }

        if (verbose || testing) {
            console.log("summary: \n\n");
            console.log(summary);
            console.log("\nprompt tokens", response.usage.prompt_tokens);
            console.log("tokens generated", response.usage.completion_tokens);
            console.log("total tokens", response.usage.total_tokens);
        }

        let answer = "y";
        if (!yes && !testing) {
            // Pause for user confirmation
            answer = await rl.question("\n\nCommit the summary to Mongodb? (y/n): ");
        }

        if (!testing && answer === "y") {
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

        // close user-input interface
        rl.close();

        return summary;

    } catch (error) {

        console.error(error);
        return null;

    }

}


async function makeSummary() {
    const dbInstance = await connectToDatabase("exbluejays");

    // retry a few times to hopefully get all failures
    const maxRetries = 6;
    for (let retry = 0; retry < maxRetries; retry++) {
        const summary = await makeCerebrasSummary(dbInstance);
        if (summary) {
            break;
        }

        if (verbose) console.log(`${maxRetries - retry} retries left . . .`);

        // wait 10 seconds before retrying
        await sleep(10000);
    }

    await closeConnection();
}


makeSummary();
