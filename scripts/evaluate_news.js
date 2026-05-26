require("dotenv").config();
const { parseFromLLM } = require("json-llm-repair");
const { connectToDatabase, closeConnection } = require("../utils/db");
const { rateNews } = require("../utils/cerebras");
const { lastSunday, sleep } = require("../utils/utils");
const argv = require("yargs")
    .option("endDate", {
        type: "string",
        describe: "specify end date"
    })
    .option("verbose", {
        alias: "v",
        type: "boolean",
        default: false,
        describe: "generate verbose output to console"
    }).argv;

const verbose = argv.verbose;

let endDate = argv.endDate;
if (endDate === undefined) {
    endDate = lastSunday().toISOString().split("T")[0];
}


async function evaluateArticle(article) {
    try {
        const cerebrasRating = await rateNews(article.content, article.playerName);
        const rawResponse =  cerebrasRating.choices[0].message.content;
        if (verbose) console.log("Cerebras: ", rawResponse);
        // sanitize the response (in case there are unescaped tabs, which happens)
        return parseFromLLM(rawResponse, {"mode": "repair"});
    } catch (error) {
        // server busy, giving up, pause for 30 seconds and continue
        if (error.status === 429) {
            if (verbose) console.log("Pausing for 30 seconds.");
            await sleep(30000);
            return null;
        } else {
            throw error;
        }
    }
}


async function evaluateNews() {

    const dbInstance = await connectToDatabase("exbluejays");
    const newsCollection = dbInstance.collection("news");

    let counter = 0;

    // find all articles for the week in question
    const cursor = newsCollection.find(
        {
            "endDate": endDate
        }
    );

    // iterate over cursor, evaluating each news item with Cerebras
    for await (const article of cursor) {
        if (article.cerebras) {
            // skip if already has "cerebras" subdocument
            if (verbose) console.log(`${article.playerName} article ${article._id} already evaluated.  Skipping.`);
        } else {
            counter++;
            if (counter % 5 === 0) {
                if (verbose) console.log("Sleeping for 5 seconds to be nice.")
                await sleep(5000);
            }

            // evaluate the news and update document
            const evaluation = await evaluateArticle(article);
            if (evaluation) {
                const cerebrasResult = await newsCollection.updateOne(
                    {
                        "_id": article._id
                    },
                    {
                        "$set": {
                            "cerebras": evaluation
                        }
                    }
                );
                if (verbose) console.log(cerebrasResult);
            }
        }
    }

    await closeConnection();
}


if (verbose) console.log(`Evaluating news for week ending ${endDate}`);
evaluateNews();
