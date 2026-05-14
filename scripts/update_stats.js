require("dotenv").config();
const fs = require("fs");
const {connectToDatabase, closeConnection} = require("../utils/db");
const argv = require("yargs")
    .option("local", {
        type: "boolean",
        default: false,
        describe: "do not write to mongo (write local file)"
    })
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

const MLB_API = process.env.MLB_API;

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const local = argv.local;
const days = argv.days;
const bbtest = argv.bbtest;
const endDate = argv.endDate;
const verbose = argv.verbose;

let endDateObj;
if (endDate) {
    endDateObj = new Date(endDate);
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
const currentYear = endDateObj.getFullYear().toString();


if (local) {
    try {
        fs.mkdirSync(`./output/${endDateString}`);
    } catch (err) {
        if (err.code === "EEXIST") {
            console.log("Directory exists, exiting.");
            process.exit(0);
        } else {
            console.error("Error creating folder", err);
            process.exit(1);
        }
    }
}

function checkLatestTeam(stats) {
    let currentTeam = null;
    if (stats.length > 0) {
        for (const split of stats[0]?.splits) {
            if ("team" in split) {
                currentTeam = split.team.name;
            }
        }
    }
    return currentTeam;
}

async function updateStats() {
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
        // get all players not back on the Blue Jays
        players_array = await playersCollection.find(
            {},
            {"_id": 1, "position": 1, "fullName": 1, "link": 1}).toArray();
    }

    for (const statsType of ["stats", "ytd"]) {

        const startDateObj = new Date(endDateObj);
        if (statsType === "ytd") {
            startDateObj.setUTCDate(1);
            startDateObj.setUTCMonth(0);
        } else {
            startDateObj.setUTCDate(endDateObj.getUTCDate() - days + 1);
        }

        const startDateString = startDateObj.toISOString().split("T")[0];
        const endDateString = endDateObj.toISOString().split("T")[0];

        console.log(`Fetching stats for ${startDateString} (${dayNames[startDateObj.getUTCDay()]}) to ${endDateString} (${dayNames[endDateObj.getUTCDay()]})`);

        // iterate over players_list
        for (const player of players_array) {
            player["stats"] = {};
            let statsGroup = "hitting";
            if (player.position === "Pitcher") {
                statsGroup = "pitching";
            }
            const player_url = `${MLB_API}${player.link}/stats?stats=byDateRange&season=${currentYear}&group=${statsGroup}&startDate=${startDateString}&endDate=${endDate}`;
            // console.log(player_url);
            if (verbose) console.log(`fetching ${player.fullName}`);

            try {
                const response = await fetch(player_url);
                if (!response.ok) throw new Error(`Could not fetch ${player.fullName}`);
                const data = await response.json();
                let latestTeam = checkLatestTeam(data.stats);
                if (latestTeam && latestTeam !== player.latest_team) {
                    console.log(`${player.fullName} changed from ${player.latest_team} to ${latestTeam}`);
                }

                if (data?.stats?.[0]?.splits?.at(-1)?.hasOwnProperty("stat")) {

                    const updateDict = data.stats[0].splits.at(-1)["stat"];
                    updateDict.team = latestTeam;

                    if (local) {
                        // write to local file instead of to Mongo
                        const lastName = player.fullName.split(" ").at(-1);
                        const jsonData = {
                            "_id": player._id,
                            "fullName": player.fullName,
                            "active": player.active,
                            "latest_team": player.latest_team,
                            "years_with_jays": player.years_with_jays,
                            "splits": data.stats[0].splits
                        }
                        fs.writeFile(`data/${endDateString}/${player._id}_${lastName}.json`, JSON.stringify(jsonData, null, 2), (err) => {
                            if (err) throw err;
                            console.log(`${player.fullName} written to file ${player._id}.json`);
                        });
                    } else {
                        // update the Mongo record
                        const result = await playersCollection.updateOne(
                            {
                                "_id": player._id
                            },
                            {
                                "$set": {
                                    "latest_team": latestTeam,
                                    [`${statsType}.${endDateString}`]: updateDict
                                }
                            }
                        );
                        if (verbose) console.log(`. . . modified ${result.modifiedCount}`);
                        if (verbose) console.log(result);
                    }
                } else {
                    if (verbose) console.log(". . . no stats");
                }
            } catch (error) {
                console.error(error);
            }
        }

        if (!local) {
            // update reports collection
            const reportsCollection = dbInstance.collection("reports");
            const reportsResult = await reportsCollection.updateOne(
                {
                    "endDate": endDateString
                },
                {
                    "$set":
                        {
                            [`fetched_${statsType}`]: new Date()
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
    }

    // close MongoDB connection
    await closeConnection();
}

updateStats();