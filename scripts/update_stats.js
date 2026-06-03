require("dotenv").config();
const fs = require("fs");
const { connectToDatabase, closeConnection } = require("../utils/db");
const { getSchedule } = require("../utils/schedule");
const { lastSunday } = require("../utils/utils");
const argv = require("yargs")
    .option("local", {
        type: "boolean",
        default: false,
        describe: "do not write to mongo (write local file)"
    })
    .option("bbtest", {
        type: "string",
        describe: "Just update player with provided pattern (local only)",
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
    .option("exBlueJays", {
        type: "string",
        default: "players",
        describe: "name of collection with active ex-blue jays"
    })
    .option("reports", {
        type: "string",
        default: "reports",
        describe: "name of collection with report details"
    })
    .option("verbose", {
        alias: "v",
        type: "boolean",
        default: false,
        describe: "generate verbose output to console"
    }).argv;

const MLB_API = process.env.MLB_API;

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const local = argv.local || argv.bbtest;
const days = argv.days;
const bbtest = argv.bbtest;
const endDate = argv.endDate;
const exBlueJays = argv.exBlueJays;
const reports = argv.reports;
const verbose = argv.verbose;

let endDateObj;
if (endDate) {
    endDateObj = new Date(endDate);
} else {
    // use last Sunday
    endDateObj = lastSunday();
}
const endDateString = endDateObj.toISOString().split("T")[0];
const currentYear = endDateObj.getFullYear().toString();

if (local) {
    try {
        fs.mkdirSync(`./output/${endDateString}`);
    } catch (err) {
        if (err.code === "EEXIST") {
            console.log("Directory exists.  Continuing.");
        } else {
            console.error("Error creating folder", err);
            process.exit(1);
        }
    }
}


async function updateStats() {
    const dbInstance = await connectToDatabase("exbluejays");
    const playersCollection = dbInstance.collection(exBlueJays);

    const transactionsList = [];

    let players_array;
    if (bbtest) {
        players_array = await playersCollection.find(
            {
                "$or": [
                    {"fullName": {"$regex": bbtest}}
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

        console.log(`Fetching stats for ${startDateString} (${dayNames[startDateObj.getUTCDay()]}) to ${endDateString} (${dayNames[endDateObj.getUTCDay()]})`);

        // iterate over players_list
        for (const player of players_array) {
            player["stats"] = {};
            let statsGroup = "hitting";
            if (player.position === "Pitcher") {
                statsGroup = "pitching";
            }
            const statsUrl = `${MLB_API}${player.link}/stats?stats=byDateRange&season=${currentYear}&group=${statsGroup}&startDate=${startDateString}&endDate=${endDateString}`;
            const transactionUrl = `${MLB_API}${player.link}?hydrate=transactions`;

            // console.log(player_url);
            if (verbose) console.log(`fetching ${player.fullName}`);

            try {
                const response = await fetch(statsUrl);
                if (!response.ok) {
                    throw new Error(`Could not fetch ${player.fullName}`);
                }
                const data = await response.json();

                if (data?.stats?.[0]?.splits?.at(-1)?.hasOwnProperty("stat")) {

                    const updateDict = data.stats[0].splits.at(-1)["stat"];
                    updateDict.team = player.latestTeam;

                    if (local) {
                        // write to local file instead of to Mongo
                        const lastName = player.fullName.split(" ").at(-1);
                        const jsonData = {
                            "_id": player._id,
                            "fullName": player.fullName,
                            "active": player.active,
                            "latestTeam": player.latestTeam,
                            "yearsWithJays": player.yearsWithJays,
                            "splits": data.stats[0].splits
                        }
                        fs.writeFile(`output/${endDateString}/${player._id}_${lastName}_${statsType}.json`, JSON.stringify(jsonData, null, 2), (err) => {
                            if (err) throw err;
                            console.log(`${player.fullName} written to file ${player._id}_${lastName}_${statsType}.json`);
                        });
                    } else {
                        // update the Mongo record
                        const result = await playersCollection.updateOne(
                            {
                                "_id": player._id
                            },
                            {
                                "$set": {
                                    [`${statsType}.${endDateString}`]: updateDict
                                }
                            }
                        );
                        if (verbose) console.log(`. . . modified ${result.modifiedCount}`);
                    }
                } else {
                    if (verbose) console.log(". . . no stats");
                }
            } catch (error) {
                console.error(error);
            }

            // check for any transactions involving this player (only do on stats pass)
            if (statsType === "stats") {

                try {
                    const response = await fetch(transactionUrl);
                    if (!response.ok) throw new Error(`Could not fetch ${transactionUrl}`);
                    const data = await response.json();
                    const transactions = data.people[0].transactions;
                    for (const trans of transactions) {
                        if (trans.date > startDateString && trans.date <= endDateString) {
                            transactionsList.push(
                                {
                                    "player_id": player._id,
                                    "playerName": player.fullName,
                                    "team": player.latestTeam,
                                    "date": trans.date,
                                    "description": trans.description,
                                    "fromTeam": trans.fromTeam?.name,
                                    "toTeam": trans.toTeam?.name,
                                    "typeDesc": trans.typeDesc,
                                    "typeCode": trans.typeCode
                                }
                            );
                            if (verbose) console.log(trans.description);
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            }
        }
    }

    // check Blue Jays schedule for the coming 7 days
    const schedule = await getSchedule(dbInstance, endDateString, verbose);

    if (!local) {
        // update reports collection (only once, for weekly stats pass)
        const reportsCollection = dbInstance.collection(reports);
        const reportsResult = await reportsCollection.updateOne(
            {
                "endDate": endDateString
            },
            {
                "$set":
                    {
                        "updated": new Date(),
                        "jaysSchedule": schedule,
                        "transactions": transactionsList
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

    // close MongoDB connection
    await closeConnection();
}

updateStats();