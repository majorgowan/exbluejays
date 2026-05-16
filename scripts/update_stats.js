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
const endDateString = endDateObj.toISOString().split("T")[0];
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
    // if multiple teams in interval, latest team is first
    const currentTeam = stats?.[0]?.splits?.[0]?.team.name;
    return currentTeam;
}

async function updateStats() {
    const dbInstance = await connectToDatabase("exbluejays");
    const teamChanges = {};

    const playersCollection = dbInstance.collection("players");
    const notes = [];

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
                if (latestTeam && latestTeam !== player.latest_team && statsType === "stats") {
                    const note = `${player.fullName} changed from ${player.latest_team} to ${latestTeam}`;
                    console.log(note);
                    notes.push(note);
                    teamChanges[player._id] = latestTeam;
                }

                if ((latestTeam && !latestTeam.includes("Toronto")) && data?.stats?.[0]?.splits?.at(-1)?.hasOwnProperty("stat")) {

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
                                    [`${statsType}.${endDateString}`]: updateDict
                                }
                            }
                        );
                        if (verbose) console.log(`. . . modified ${result.modifiedCount}`);
                        if (verbose) console.log(result);
                        if (verbose) console.log(latestTeam, player.latest_team);
                    }
                } else {
                    if (verbose) console.log(". . . no stats");
                }
            } catch (error) {
                console.error(error);
            }
        }
    }

    // check Blue Jays schedule for the coming 7 days
    const nextDayObj = new Date(endDate);
    const nextWeekObj = new Date(endDate);
    nextDayObj.setUTCDate(nextDayObj.getUTCDate() + 1);
    nextWeekObj.setUTCDate(nextWeekObj.getUTCDate() + 7);
    const nextDayString = nextDayObj.toISOString().split("T")[0];
    const nextWeekString = nextWeekObj.toISOString().split("T")[0];
    const schedule_url = `${MLB_API}/api/v1/schedule?sportId=1&teamId=141&startDate=${nextDayString}&endDate=${nextWeekString}`;
    const schedule = [];

    try {
        if (verbose) console.log(`fetching schedule at ${schedule_url}`);
        const response = await fetch(schedule_url);
        if (!response.ok) throw new Error("Could not fetch schedule");
        const data = await response.json();

        if ("dates" in data) {
            for (const date of data.dates) {
                for (const game of date?.games) {
                    const entry = {
                        "officialDate": game.officialDate,
                        "venue": game.venue.name,
                    };
                    if (game.teams.away.team.name.includes("Toronto")) {
                        entry.opponent = game.teams.home.team.name;
                        entry.home = false;
                        entry.phrase = "at the";
                    } else {
                        entry.opponent = game.teams.away.team.name;
                        entry.home = true;
                        entry.phrase = "home to the";
                    }
                    schedule.push(entry);
                }
            }
        }

    } catch (error) {
        console.error(error);
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
                        "updated": new Date(),
                        "notes": notes,
                        "jays_schedule": schedule
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

    if (verbose) {
        console.log("team changes");
        console.log(teamChanges);
    }
    // apply team changes to players collection
    for (const [player_id, new_team] of Object.entries(teamChanges)) {
        const result = await playersCollection.updateOne(
            {
                "_id": parseInt(player_id),
            },
            {
                "$set": {
                    "latest_team": new_team
                }
            }
        )
        if (verbose) console.log(result);
    }

    // close MongoDB connection
    await closeConnection();
}

updateStats();