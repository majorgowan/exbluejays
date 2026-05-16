async function buildSchedule(dbInstance, endDate) {
    // retrieve schedule from the report
    const scheduleDoc = await dbInstance.collection("reports").findOne(
        {"endDate": endDate},
        {"jays_schedule": 1}
    );

    if (!scheduleDoc) return null;

    const series = {};
    for (const game of scheduleDoc.jays_schedule) {
        const key = `${game.phrase} ${game.opponent}`
        if (key in series) {
            series[key].to_date = game.officialDate;
        } else {
            series[key] = {
                opponent: game.opponent,
                venue: game.venue,
                phrase: game.phrase,
                from_date: game.officialDate,
            }

            // retrieve active players on that team
            const playersArray = await dbInstance.collection("players").aggregate([
                {
                    "$match": {
                        "active": true,
                        "latest_team": game.opponent
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
                            "$arrayElemAt": ["$years_with_jays", -1]
                        }
                    }
                }
            ]).toArray();

            series[key].hitters = playersArray.filter(player => {
                return (player.position !== "Pitcher" && player.activity);
            }).map(player => {
                return `${player.fullName} (${player.last_year_with_jays})`;
            });
            series[key].pitchers = playersArray.filter(player => {
                return (player.position === "Pitcher" && player.activity);
            }).map(player => {
                return `${player.fullName} (${player.last_year_with_jays})`;
            });
        }
    }

    return series;
}

module.exports = { buildSchedule };