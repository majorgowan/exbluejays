require("dotenv").config();
const { connectToDatabase, closeConnection } = require("../utils/db");
const { askTavily, buildQuery } = require("../utils/tavily");
const { rateNews } = require("../utils/cerebras");
const { lastSunday, generateRandomString, sleep } = require("../utils/utils");
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
const startDateObj = new Date(endDate);
startDateObj.setUTCDate(startDateObj.getUTCDate() - 6);
const startDate = startDateObj.toISOString().split("T")[0];

// specify news domains to search
const domains = [
    // "sportingnews.com",
    // "mlb.com",
    // "cbssports.com"
];


async function processPlayer(player) {
    // TODO: wrap tavily and cerebras calls in try/catch to handle errors gracefully
    const query = buildQuery(player);
    if (verbose) console.log("\n\nQUERY:", query);
    const news = await askTavily(query, startDate, endDate, domains);
    const playerNews = [];
    for (const item of news.results) {
        const articleData = {
            "endDate": endDate,
            "player_id": player._id,
            "playerName": player.fullName,
            "title": item.title,
            "url": item.url,
            "publishedDate": item.publishedDate,
            "relevanceScore": item.score,
            "_id": generateRandomString(10)
        };
        if (verbose) console.log(articleData);
        if (item.content && item?.score > 0.3) {
            const cerebrasRating = await rateNews(item.content, player);
            if ( !("error" in cerebrasRating) ) {
                if (verbose) console.log("Cerebras: ", cerebrasRating.choices[0].message.content);
                articleData.cerebras = JSON.parse(cerebrasRating.choices[0].message.content);
            } else if (cerebrasRating.error?.status === 429) {
                // server busy, pause for a minute
                if (verbose) console.log("Pausing for 60 seconds.");
                await sleep(60000);
            }
        }
        if (articleData.cerebras?.rating >= 2) {
            playerNews.push(articleData);
        }
    }
    return playerNews;
}

async function fetchNews() {

    const dbInstance = await connectToDatabase("exbluejays");

    // get names of active ex-Bats with at least
    // N games as a blue jay and ex-Arms with at least M
    // search for news about each of them (relevant chunks & url is sufficient)
    const exbats = await dbInstance.collection("players").find(
        {
            "games_with_jays": {"$gte": 100},
            "latest_team": {"$not": { "$regex": "Toronto" } },
            "position": {"$ne": "Pitcher"},
            "stats": { "$exists": true }
        },
        {
            "projection": {
                "fullName": 1,
                "position": 1,
                "latest_team": 1,
                "games_with_jays": 1
            },
            "sort": {
                "games_with_jays": -1
            },
            "limit": 30,
        }
    );

    const exarms = await dbInstance.collection("players").find(
        {
            "games_with_jays": {"$gte": 25},
            "latest_team": {"$not": { "$regex": "Toronto" } },
            "position": "Pitcher",
            "stats": { "$exists": true }
        },
        {
            "projection": {
                "fullName": 1,
                "position": 1,
                "latest_team": 1,
                "games_with_jays": 1
            },
            "sort": {
                "games_with_jays": -1
            },
            "limit": 30,
        }
    );

    const relevantNews = [];
    for await (const player of exbats) {
        const playerNews = await processPlayer(player);
        relevantNews.push(...playerNews);
    }
    for await (const player of exarms) {
        const playerNews = await processPlayer(player);
        relevantNews.push(...playerNews);
    }

    if (!testing) {
        // update reports collection
        const newsCollection = dbInstance.collection("news");
        const result = await newsCollection.insertMany(relevantNews);
        if (result.acknowledged) {
            if (verbose) console.log(result);
        }
    }

    await closeConnection();
}

fetchNews();
