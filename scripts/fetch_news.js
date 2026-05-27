require("dotenv").config();
const { fuzzy } = require("fast-fuzzy");
const { connectToDatabase, closeConnection } = require("../utils/db");
const { askTavily, buildQuery } = require("../utils/tavily");
const { lastSunday, generateRandomString, sleep } = require("../utils/utils");
const argv = require('yargs')
    .option("endDate", {
        type: "string",
        describe: "specify end date"
    })
    .option("relevance_threshold", {
        type: "number",
        default: 0.1,
        describe: "minimum tavily relevance score to retain"
    })
    .option("verbose", {
        alias: "v",
        type: "boolean",
        default: false,
        describe: "generate verbose output to console"
    }).argv;


const verbose = argv.verbose;
const relevanceThreshold = argv.relevance_threshold;

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


function hasDuplicate(article, articleList, titleThreshold, contentThreshold) {
    if (verbose) console.log("checking for duplicates. . .");
    articleList.forEach(other => {
        const titleComp = fuzzy(article.title, other.title);
        const contentComp = fuzzy(article.content, other.content);
        if (titleComp > titleThreshold && contentComp > contentThreshold) {
            if (verbose) console.log(`Duplicate of ${other.title}`);
            return true;
        }
    })
    return false;
}


async function fetchPlayerNews(player, newsCollection, minRelevance) {
    const query = buildQuery(player);
    if (verbose) console.log("\n\nQUERY:", query);
    const news = await askTavily(query, startDate, endDate, domains);
    const playerNews = [];
    for (const item of news.results) {
        if (item.score > minRelevance) {
            const articleData = {
                "endDate": endDate,
                "player_id": player._id,
                "playerName": player.fullName,
                "title": item.title,
                "url": item.url,
                "publishedDate": item.publishedDate,
                "relevanceScore": item.score,
                "content": item.content,
                "_id": generateRandomString(10)
            };
            if (verbose) console.log(articleData);
            // compare to previous articles in case of duplicate
            if (!hasDuplicate(articleData, playerNews, 0.7, 0.3)) {
                playerNews.push(articleData);
            }
        }
    }
    // push the news to mongo
    if (playerNews.length > 0) {
        const result = await newsCollection.insertMany(playerNews);
        if (result.acknowledged) {
            if (verbose) console.log(result);
        }
        return result;
    } else {
        return {"message": `No relevant news found about ${player.fullName}`};
    }
}


async function fetchGroupNews(playerCursor, newsCollection) {
    let counter = 1;
    for await (const player of playerCursor) {
        console.log(player.fullName);
        // check if player news is already in database
        const cursor = newsCollection.find(
            {
                "player_id": player._id,
                "endDate": endDate,
            }
        );
        if (await cursor.hasNext()) {
            console.log(`${player.fullName} news already gathered, skipping...`);
        } else {
            // pause to be nice every 5
            if (counter % 5 === 0) await sleep(2000);
            counter++;
            const result = await fetchPlayerNews(player, newsCollection, relevanceThreshold);
            if (verbose) console.log(result);
        }
    }
}

async function fetchNews() {

    const dbInstance = await connectToDatabase("exbluejays");
    const newsCollection = dbInstance.collection("news");

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
    await fetchGroupNews(exbats, newsCollection);

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
    await fetchGroupNews(exarms, newsCollection);

    await closeConnection();
}


if (verbose) console.log(`Fetching news for week ending ${endDate}`);
fetchNews();
