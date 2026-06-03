require("dotenv").config();
const { connectToDatabase, closeConnection } = require("../utils/db");
const { sleep } = require("../utils/utils");
const { teamIdMap} = require("../utils/mlb");
const { lastSunday } = require("../utils/utils");
const argv = require("yargs")
    .option("allPlayers", {
        type: "string",
        default: "allplayers",
        describe: "name of collection with all blue jays players"
    })
    .option("exBlueJays", {
        type: "string",
        default: "players",
        describe: "name of collection with active ex-blue jays"
    })
    .option("endDate", {
        type: "string",
        describe: "specify end date (for determining latestTeam"
    })
    .option("skipRetired", {
        type: "boolean",
        default: true,
        describe: "if true, don't recheck players marked 'retired'"
    })
    .option("skipStatus", {
        type: "boolean",
        default: false,
        describe: "if true, skip status update and go straight to career stats"
    })
    .option("verbose", {
        alias: "v",
        type: "boolean",
        default: false,
        describe: "generate verbose output to console"
    }).argv;

const MLB_API = process.env.MLB_API;

const allPlayers = argv.allPlayers;
const exBlueJays = argv.exBlueJays;
const endDate = argv.endDate;
const skipRetired = argv.skipRetired;
const skipStatus = argv.skipStatus;
const verbose = argv.verbose;

let endDateObj;
if (endDate) {
    endDateObj = new Date(endDate);
} else {
    // use last Sunday
    endDateObj = lastSunday();
}
const endDateString = endDateObj.toISOString().split("T")[0];

const fourYearsAgo = new Date();
fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);

function checkActivity(playerBio) {
    // if active: false and lastPlayedDate is more than
    // three years ago, remove from players Collection
    // if active: true, add to players collection if he's
    // not already there
    const returnDict =  {
        "active": playerBio.active,
        "birthDate": playerBio.birthDate,
        "lastPlayed": playerBio.lastPlayedDate
    }
    if (!playerBio.active && "lastPlayedDate" in playerBio) {
        const lastPlayedDate = new Date(playerBio.lastPlayedDate);
        if (lastPlayedDate < fourYearsAgo) {
            returnDict.retired = true;
        }
    }
    return returnDict;
}


function getTeamChanges(transactions) {
    const transMLB = transactions.filter(tran => {
        return tran.toTeam.id in teamIdMap;
    }).map(tran => {
        return {
            "dateString": tran.date,
            "to": tran.toTeam.name,
            "desc": tran.description
        }
    });

    const changes = transMLB.filter((current, i) => {
        return i === 0 || current.to !== transMLB[i - 1].to;
    });

    return changes;
}


function getYearsWithJays(playerStatSplits) {
    // take array of season stats
    // if player with multiple teams in a single season, one
    // set of stats for each team/year plus a cumulative set
    // of stats (with numTeams representing the number of teams)
    let yearsWithJays = [];
    let gamesWithJays = 0;
    let latestTeam = "";
    for (const split of playerStatSplits) {
        if (split.team?.name.includes("Toronto")) {
            // add the season year to the list
            yearsWithJays.push(split.season);
            gamesWithJays += split.stat?.gamesPlayed;
        }
        if ("team" in split) {
            latestTeam = split.team.name;
        }
    }
    return {
        "yearsWithJays": yearsWithJays,
        "gamesWithJays": gamesWithJays
    };
}

async function updateStatus() {
    const dbInstance = await connectToDatabase("exbluejays");
    const allPlayersCollection = dbInstance.collection(allPlayers);
    const exBlueJaysCollection = dbInstance.collection(exBlueJays);

    // go through allPlayers collection
    // query player on MLB_API
    // check: active: true/false
    //        birthdate
    //        lastPlayedDate
    const cursor = allPlayersCollection.find({});
    let counter = 1;

    if (!skipStatus) {

        for await (const player of cursor) {
            console.log(`Processing ${player.fullName}`);
            if (!skipRetired || !("retired" in player) || !player.retired) {
                counter++;
                // player not known to be retired so check status
                const playerURL = `${MLB_API}${player.link}`;

                try {
                    const response = await fetch(playerURL);
                    if (!response.ok) throw new Error(`Could not fetch ${playerURL}`);
                    const playerData = await response.json();
                    const playerInfo = checkActivity(playerData.people[0]);
                    if (verbose) console.log(playerInfo);
                    // update player
                    const updateResult = await allPlayersCollection.updateOne(
                        {"_id": player._id},
                        {"$set": playerInfo}
                    );
                    if (verbose) console.log(updateResult);
                } catch (err) {
                    console.error(err);
                }

            }
            // pause to be nice
            if (counter % 10 === 0) {
                await sleep(2000);
            }
        }
    }

    // iterate again through the collection
    // if active, query player's career stats
    // check: years with Blue Jays
    await cursor.rewind();
    for await (const player of cursor) {
        if (!skipRetired || !("retired" in player) || !player.retired ) {
            console.log(`Processing ${player.fullName}`);
            counter++;
            // player not known to be retired so check career stats
            // to determine which years he played for the Blue Jays and
            // if he plays for a different team
            const playerGroup = (player.position === "Pitcher") ? "pitching" : "hitting";
            const playerURL = `${MLB_API}${player.link}/stats?stats=yearByYear&group=${playerGroup}`;
            const playerBaseURL = `${MLB_API}${player.link}?hydrate=transactions`;

            try {
                const response = await fetch(playerURL);
                if (!response.ok) throw new Error(`Could not fetch ${playerURL}`);
                const playerData = await response.json();
                // check career stats (years with Jays, current team)
                if (playerData.stats.length > 0 && "splits" in playerData.stats[0]) {
                    const playerInfo = getYearsWithJays(playerData.stats[0]?.splits);
                    // update yearsWithJays and gamesWithJays
                    // add even if still with Jays (filter at report time)
                    // to keep track of Jays that leave team each week
                    // upsert player into exBlueJays collection
                    if (playerInfo.yearsWithJays.length > 0) {
                        const exJayInfo = {...player, ...playerInfo};
                        const updateResult = await exBlueJaysCollection.updateOne(
                            {"_id": exJayInfo._id},
                            {"$set": exJayInfo},
                            {"upsert": true}
                        );
                        if (verbose) console.log(updateResult);
                    }
                }
            } catch (err) {
                console.error(err);
            }
            // visit player's base profile endpoint and update personal information
            try {
                if (verbose) console.log(`Updating ${player.fullName} personal info.`);
                const response = await fetch(playerBaseURL);
                if (!response.ok) throw new Error(`Could not fetch ${playerURL}`);
                const playerData = await response.json();

                const teamChanges = getTeamChanges(playerData.people[0].transactions);
                const latestTeam = teamChanges.filter(tc => tc.date <= endDate).at(-1)?.to;

                const updateInfo = {
                    "position": playerData.people[0].primaryPosition.name,
                    "birthDate": playerData.people[0].birthDate,
                    "birthCity": playerData.people[0].birthCity,
                    "birthCountry": playerData.people[0].birthCountry,
                    "batSide": playerData.people[0].batSide.description,
                    "pitchHand": playerData.people[0].pitchHand.description,
                    "teamChanges": teamChanges,
                    "latestTeam": latestTeam
                };

                // update player in exBlueJays collection
                const updateResult = await exBlueJaysCollection.updateOne(
                    {"_id": player._id},
                    {"$set": updateInfo},
                );
                if (verbose && updateResult.modifiedCount > 0) {
                    console.log(`... modified ${updateResult.modifiedCount}`);
                }
            } catch (err) {
                console.error(err);
            }

        }
        // pause to be nice
        if (counter % 10 === 0) {
            await sleep(2000);
        }
    }

    await closeConnection();

}

updateStatus();