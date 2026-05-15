require("dotenv").config();
const {connectToDatabase, closeConnection} = require("../utils/db");
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
const skipRetired = argv.skipRetired;
const skipStatus = argv.skipStatus;
const verbose = argv.verbose;

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

function checkCareerTeams(playerStatSplits) {
    // take array of season stats
    // if player with multiple teams in a single season, one
    // set of stats for each team/year plus a cumulative set
    // of stats (with numTeams representing the number of teams)
    let yearsWithJays = [];
    let latestTeam = "";
    for (const split of playerStatSplits) {
        if (split.team?.name.includes("Toronto")) {
            // add the season year to the list
            yearsWithJays.push(split.season);
        }
        if ("team" in split) {
            latestTeam = split.team.name;
        }
    }
    return {
        "years_with_jays": yearsWithJays,
        "latest_team": latestTeam
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
                await new Promise(resolve => setTimeout(resolve, 2000)); // Pause for 1 second
            }
        }
    }

    // iterate again through the collection
    // if active, query player's career stats
    // check: years with Blue Jays
    //        most recent team
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

            try {
                const response = await fetch(playerURL);
                if (!response.ok) throw new Error(`Could not fetch ${playerURL}`);
                const playerData = await response.json();
                // check career stats (years with Jays, current team)
                if (playerData.stats.length > 0 && "splits" in playerData.stats[0]) {
                    const playerInfo = checkCareerTeams(playerData.stats[0]?.splits);
                    // update years_with_jays and latest_team
                    // add even if still with Jays (filter at report time)
                    // to keep track of Jays that leave team each week
                    // upsert player into exBlueJays collection
                    if (playerInfo.years_with_jays.length > 0) {
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
        }
        // pause to be nice
        if (counter % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Pause for 1 second
        }
    }

    await closeConnection();

}

updateStatus();