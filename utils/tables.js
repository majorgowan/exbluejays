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
                "years_with_jays": 1
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
                "ex_since": player.years_with_jays.at(-1),
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
            return {
                "_id": player._id,
                "name": player.fullName,
                "team": ps.team,
                "ex_since": player.years_with_jays.at(-1),
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
                "RP": runsPrevented
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

module.exports = { buildTables };