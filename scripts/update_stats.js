require("dotenv").config();
const {connectToDatabase, closeConnection} = require("../utils/db");
const argv = require('yargs')
    .option("bbtest", {
        type: "boolean",
        default: false,
        describe: "Just update Bo Bichette and Chris Bassitt",
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
    })
    .option("calendar", {
        alias: "c",
        type: "boolean",
        default: false,
        describe: "last calendar week Monday-to-Sunday",
    }).argv;

const MLB_API = process.env.MLB_API;

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const days = argv.days;
const calendar = argv.calendar;
const bbtest = argv.bbtest;
const enddate = argv.enddate;

function lastSunday() {
    // get the date of last Sunday
    const lastSunday = new Date();
    const day = lastSunday.getUTCDay(); // Sunday = 0, Saturday = 6
    lastSunday.setUTCDate(lastSunday.getUTCDate() - day);
    return lastSunday;
}

let endDateObj;
if (enddate) {
    endDateObj = new Date(enddate);
} else if (calendar) {
    // use games until LAST SUNDAY
    endDateObj = lastSunday();
} else {
    // use today
    endDateObj = new Date();
}
const startDateObj = new Date(endDateObj);
startDateObj.setUTCDate(endDateObj.getUTCDate() - days + 1);

const startDateString = startDateObj.toISOString().split("T")[0];
const endDateString = endDateObj.toISOString().split("T")[0];
const currentYear = startDateObj.getFullYear().toString();

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
            if (data?.stats?.[0]?.splits?.[0]?.hasOwnProperty("stat")) {
                // update the Mongo record
                const result = await playersCollection.updateOne(
                    {
                        "_id": player._id
                    },
                    {
                        "$set": {
                            [`stats.${endDateString}`]: data.stats[0].splits[0]["stat"]
                        }
                    }
                );
                console.log(`. . . modified ${result.modifiedCount}`);
            } else {
                console.log(". . . no stats");
            }
        } catch (error) {
            console.error(error);
        }
    }

    // update reports collection
    const reportsCollection = dbInstance.collection("reports");
    const reportsResult = await reportsCollection.insertOne(
        {
            "endDate": endDateString,
            "fetched": new Date(),
            "complete": true
        }
    );
    if (reportsResult.acknowledged) {
        console.log(`inserted report: ${reportsResult.insertedId}`);
    }

    await closeConnection();
}

update_stats(startDateString, endDateString);