async function buildTables(dbInstance, statsType, endDate) {
    // retrieve stats for specified date
    const playersArray = await dbInstance.collection("players").aggregate([
        {
            "$match": {
                "current_team": {
                    "$not": {"$regex": "Toronto"}
                },
                [`${statsType}.${endDate}`]: {"$exists": true}
            }
        },
        {
            "$project": {
                "_id": 1,
                "fullName": 1,
                "position": 1,
                "latest_team": 1,
                [`${statsType}.${endDate}`]: 1,
                "years_with_jays": 1,
                "games_with_jays": 1
            }
        },
        {
            "$sort": {
                [`${statsType}.${endDate}.ops`]: -1
            }
        }
    ]).toArray();

    // build hitters table
    const hitters = playersArray
        .filter(player => {
            return (player.position !== "Pitcher");
        }).map(player => {
            const ps = player[statsType][endDate];
            const runsCreated = (ps.hits + ps.baseOnBalls) * ps.totalBases / (ps.atBats + ps.baseOnBalls);
            return {
                "_id": player._id,
                "name": player.fullName,
                "position": player.position,
                "team": ps.team,
                "yearsWithJays": player.years_with_jays,
                "ex_since": player.years_with_jays.at(-1),
                "gamesWithJays": player.games_with_jays,
                "gamesPlayed": ps.gamesPlayed,
                "atBats": ps.atBats,
                "avg": ps.avg,
                "obp": ps.obp,
                "slg": ps.slg,
                "ops": ps.ops,
                "hits": ps.hits,
                "runs": ps.runs,
                "homeRuns": ps.homeRuns,
                "rbi": ps.rbi,
                "strikeOuts": ps.strikeOuts,
                "baseOnBalls": ps.baseOnBalls,
                "stolenBases": ps.stolenBases,
                "groundIntoDoublePlay": ps.groundIntoDoublePlay,
                "plateAppearances": ps.plateAppearances,
                "runsCreated": runsCreated
            };
        });

    // build pitchers table
    const pitchers = playersArray
        .filter(player => {
            return (player.position === "Pitcher");
        }).map(player => {
            const ps = player[statsType][endDate];
            const runsPrevented = (4.8 / 9 * ps.inningsPitched ) - ps.earnedRuns;
            const frumans = runsPrevented + 0.5 * ( ps.saves - 0.5 * ps.blownSaves + 0.25 * ps.holds );
            return {
                "_id": player._id,
                "name": player.fullName,
                "team": ps.team,
                "yearsWithJays": player.years_with_jays.join(","),
                "ex_since": player.years_with_jays.at(-1),
                "gamesWithJays": player.games_with_jays,
                "gamesPitched": ps.gamesPitched,
                "gamesStarted": ps.gamesStarted,
                "inningsPitched": ps.inningsPitched,
                "wins": ps.wins,
                "losses": ps.losses,
                "era": ps.era,
                "whip": ps.whip,
                "saves": ps.saves,
                "holds": ps.holds,
                "hits": ps.hits,
                "homeRuns": ps.homeRuns,
                "earnedRuns": ps.earnedRuns,
                "strikeOuts": ps.strikeOuts,
                "baseOnBalls": ps.baseOnBalls,
                "runsPrevented": runsPrevented,
                "frumans": frumans
            };
        });
    // sort pitchers by ERA then WHIP
    pitchers.sort((pitcherA, pitcherB) => {
        const diff = pitcherA.era - pitcherB.era;
        if (diff === 0) {
            return pitcherA.whip - pitcherB.whip;
        }
        return diff;
    });

    return {
        "hitters": hitters,
        "pitchers": pitchers
    }
}


async function buildSummary(dbInstance, endDate) {
    // retrieve summary for specified date
    const summaryDoc = await dbInstance.collection("reports").findOne(
        { "endDate": endDate },
        { "summary": 1 }
    );

    return summaryDoc.summary;
}


async function buildSeries(dbInstance, endDate) {
    // retrieve schedule from the report
    const scheduleDoc = await dbInstance.collection("reports").findOne(
        {"endDate": endDate},
        {"jays_schedule": 1}
    );

    if (!scheduleDoc) return null;

    const series = {};
    for (const game of scheduleDoc.jays_schedule.games) {
        const key = `${game.phrase} ${game.opponent}`
        if (key in series) {
            series[key].to_date = game.officialDate;
        } else {
            series[key] = {
                opponent: game.opponent,
                venue: game.venue,
                phrase: game.phrase,
                from_date: game.officialDate,
                exBats: scheduleDoc.jays_schedule.exBats[game.opponent],
                exArms: scheduleDoc.jays_schedule.exArms[game.opponent],
            }
        }
    }

    return series;
}


async function buildNews(dbInstance, endDate, threshold=6) {
    // retrieve schedule from the report
    const newsRoundup = await dbInstance.collection("news").find(
        {
            "endDate": endDate,
            "cerebras.rating": {"$gte": threshold}
        },
        {
            "projection": {
                "title": 1,
                "url": 1,
                "playerName": 1,
                "publishedDate": 1,
                "category": "$cerebras.category",
                "summary": "$cerebras.summary"
            }
        }
    ).toArray();

    // add category-based class name and short date
    for (const newsItem of newsRoundup) {
        newsItem.categoryClass = "category" + newsItem.category.toLowerCase().replace(/ /g, "");
        newsItem.shortDate = (new Date(newsItem.publishedDate)).toLocaleDateString('en-US',
            { month: 'long', day: 'numeric' }
        );
        newsItem.shortTitle = (newsItem.title.length > 65 ? newsItem.title.substring(0, 65) + "..." : newsItem.title);
    }

    // sort by date
    newsRoundup.sort((itemA, itemB) => {
       return new Date(itemA.publishedDate) - new Date(itemB.publishedDate);
    });

    return newsRoundup;
}


module.exports = { buildTables, buildSeries, buildSummary, buildNews };