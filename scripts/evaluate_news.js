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
        // server busy, giving up, pause for a few seconds and continue
        if (error.status === 429) {
            if (verbose) console.log("Pausing for 10 seconds.");
            await sleep(10000);
            return {"failed": article._id.toString()};
        } else {
            throw error;
        }
    }
}


async function evaluateNews(dbInstance, articleList = []) {

    const newsCollection = dbInstance.collection("news");

    let counter = 0;
    const failedList = [];

    let cursor;
    if (articleList.length === 0) {
        // find all articles for the week in question
        cursor = newsCollection.find(
            {
                "endDate": endDate
            }
        );
    } else {
        // find articles missed in last iteration
        if (verbose) console.log(`evaluating articles ${articleList.join(", ")}`);
        cursor = newsCollection.find(
            {
                "_id": {
                    "$in": articleList
                }
            }
        );
    }

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
            if ("failed" in evaluation) {
                if (verbose) console.log(`article ${evaluation.failed} failed to evaluate.`);
                failedList.push(evaluation.failed);
            } else {
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

    return failedList;

}

async function evaluateAllNews() {
    const dbInstance = await connectToDatabase("exbluejays");

    // retry a few times to hopefully get all failures
    let failedList = [];
    for (let retry = 0; retry < 6; retry++) {
        if (verbose && failedList.length > 0) console.log(`retrying ${failedList.length} articles.`);
        failedList = await evaluateNews(dbInstance, failedList);
        if (failedList.length === 0) {
            if (verbose) console.log(`All articles evaluated!`);
            break;
        }

        if (verbose) console.log(`${failedList.length} failed to evaluate.`);

        // wait one minute before retry
        await sleep(60000);
    }

    await closeConnection();
}


if (verbose) console.log(`Evaluating news for week ending ${endDate}`);

evaluateAllNews();
