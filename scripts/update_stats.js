require("dotenv").config();
const {connectToDatabase, closeConnection} = require("../utils/db");
const argv = require('yargs')
    .option("bbtest", {
        type: "boolean",
        default: false,
        describe: "Just update Bo Bichette and Chris Bassitt",
    })
    .option("ytd", {
        alias: "y",
        type: "boolean",
        default: false,
        describe: "fetch year-to-date stats up to endDate (overrides days)"
    })
    .option("days", {
        alias: "d",
        type: "number",
        default: 7,
        describe: "number of days",
    })
    .option("enddate", {
        type: "string",
        describe: "specify end date"
    }).argv;

const MLB_API = process.env.MLB_API;

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const days = argv.days;
const bbtest = argv.bbtest;
const enddate = argv.enddate;
const ytd = argv.ytd;

let endDateObj;
if (enddate) {
    endDateObj = new Date(enddate);
} else {
    // use last Sunday
    endDateObj = new Date();
    const day = endDateObj.getUTCDay();
    if (day === 0) {
        endDateObj.setUTCDate(endDateObj.getUTCDate() - 7);
    } else {
        endDateObj.setUTCDate(endDateObj.getUTCDate() - day);
    }
}

// set start date
const currentYear = endDateObj.getFullYear().toString();
const startDateObj = new Date(endDateObj);

let statsType;

if (ytd) {
    startDateObj.setUTCDate(1);
    startDateObj.setUTCMonth(0);
    statsType = "ytd";
} else {
    startDateObj.setUTCDate(endDateObj.getUTCDate() - days + 1);
    statsType = "stats";
}

const startDateString = startDateObj.toISOString().split("T")[0];
const endDateString = endDateObj.toISOString().split("T")[0];

console.log(`Fetching stats for ${startDateString} (${dayNames[startDateObj.getUTCDay()]}) to ${endDateString} (${dayNames[endDateObj.getUTCDay()]})`);

async function update_stats(startDate, endDate) {
    const dbInstance = await connectToDatabase("exbluejays");

    const playersCollection = dbInstance.collection("players");

    let players_array;
    if (bbtest) {
        players_array = await playersCollection.find(
            {
                "$or": [
                    {"fullName": {"$regex": "Bichette"}},
                    {"fullName": {"$regex": "Bass"}}
                ]
            },
            {"_id": 1, "position": 1, "fullName": 1, "link": 1}).toArray();
    } else {
        players_array = await playersCollection.find(
            {},
            {"_id": 1, "position": 1, "fullName": 1, "link": 1}).toArray();
    }

    // iterate over players_list
    for (const player of players_array) {
        player["stats"] = {};
        let statsGroup = "hitting";
        if (player.position === "Pitcher") {
            statsGroup = "pitching";
        }
        const player_url = `${MLB_API}${player.link}/stats?stats=byDateRange&season=${currentYear}&group=${statsGroup}&startDate=${startDate}&endDate=${endDate}`;
        // console.log(player_url);
        console.log(`fetching ${player.fullName}`);

        try {
            const response = await fetch(player_url);
            if (!response.ok) throw new Error(`Could not fetch ${player.fullName}`);
            const data = await response.json();
            if (data?.stats?.[0]?.splits?.at(-1)?.hasOwnProperty("stat")) {
                // update the Mongo record
                const result = await playersCollection.updateOne(
                    {
                        "_id": player._id
                    },
                    {
                        "$set": {
                            [`${statsType}.${endDateString}`]: data.stats[0].splits[0]["stat"]
                        }
                    }
                );
                console.log(`. . . modified ${result.modifiedCount}`);
                console.log(result);
            } else {
                console.log(". . . no stats");
            }
        } catch (error) {
            console.error(error);
        }
    }

    // update reports collection
    const reportsCollection = dbInstance.collection("reports");
    const reportsResult = await reportsCollection.updateOne(
        {
            "endDate": endDateString
        },
        {
            "$set":
            {
                [`fetched_${statsType}`] : new Date()
            }
        },
        {
            "upsert": true
        }
    );
    if (reportsResult.acknowledged) {
        console.log(reportsResult);
    }

    await closeConnection();
}

update_stats(startDateString, endDateString);