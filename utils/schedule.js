async function getSchedule(dbInstance, endDate, verbose=false) {
    // check Blue Jays schedule for the coming 7 days
    const MLB_API = process.env.MLB_API;
    const nextDayObj = new Date(endDate);
    const nextWeekObj = new Date(endDate);
    nextDayObj.setUTCDate(nextDayObj.getUTCDate() + 1);
    nextWeekObj.setUTCDate(nextWeekObj.getUTCDate() + 7);
    const nextDayString = nextDayObj.toISOString().split("T")[0];
    const nextWeekString = nextWeekObj.toISOString().split("T")[0];
    const schedule_url = `${MLB_API}/api/v1/schedule?sportId=1&teamId=141&startDate=${nextDayString}&endDate=${nextWeekString}`;
    const games = [];
    const exArms = {};
    const exBats = {};

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
                    games.push(entry);
                    // initialize empty arrays for players
                    exBats[entry.opponent] = [];
                    exArms[entry.opponent] = [];
                }
            }
        }

    } catch (error) {
        console.error(error);
    }

    // iterate over opponents and retrieve active exJays on those teams as of now
    for (const opponent in exArms) {
        const playersArray = await dbInstance.collection("players").aggregate([
            {
                "$match": {
                    "active": true,
                    "latestTeam": opponent
                }
            },
            {
                "$project": {
                    "fullName": 1,
                    "position": 1,
                    "activity": {
                        "$map": {
                            "input": {"$objectToArray": "$stats"},
                            "as": "item",
                            "in": "$$item.k"
                        }
                    },
                    "last_year_with_jays": {
                        "$arrayElemAt": ["$yearsWithJays", -1]
                    }
                }
            }
        ]).toArray();

        exBats[opponent] = playersArray.filter(player => {
            return (player.position !== "Pitcher" && player.activity);
        }).map(player => {
            return `${player.fullName} (${player.last_year_with_jays})`;
        });
        exArms[opponent] = playersArray.filter(player => {
            return (player.position === "Pitcher" && player.activity);
        }).map(player => {
            return `${player.fullName} (${player.last_year_with_jays})`;
        });
    }

    return {
        "games": games,
        "exBats": exBats,
        "exArms": exArms
    }

}

module.exports = { getSchedule };