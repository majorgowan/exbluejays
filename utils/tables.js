async function buildTables(dbInstance, statsType, endDate) {
    // retrieve stats for specified date
    const playersArray = await dbInstance.collection("players").aggregate([
        {
            "$match": {
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
            return {
                "_id": player._id,
                "name": player.fullName,
                "position": player.position,
                "team": player.latest_team,
                "ex_since": player.years_with_jays.at(-1),
                "gamesPlayed": player[statsType][endDate].gamesPlayed,
                "atBats": player[statsType][endDate].atBats,
                "avg": player[statsType][endDate].avg,
                "obp": player[statsType][endDate].obp,
                "slg": player[statsType][endDate].slg,
                "ops": player[statsType][endDate].ops,
                "hits": player[statsType][endDate].hits,
                "runs": player[statsType][endDate].runs,
                "homeRuns": player[statsType][endDate].homeRuns,
                "rbi": player[statsType][endDate].rbi,
                "strikeOuts": player[statsType][endDate].strikeOuts,
                "baseOnBalls": player[statsType][endDate].baseOnBalls,
                "stolenBases": player[statsType][endDate].stolenBases,
                "groundIntoDoublePlay": player[statsType][endDate].groundIntoDoublePlay,
                "plateAppearances": player[statsType][endDate].plateAppearances
            };
        });

    // build pitchers table
    const pitchers = playersArray
        .filter(player => {
            return (player.position === "Pitcher");
        }).map(player => {
            return {
                "_id": player._id,
                "name": player.fullName,
                "team": player.latest_team,
                "ex_since": player.years_with_jays.at(-1),
                "gamesPitched": player[statsType][endDate].gamesPitched,
                "gamesStarted": player[statsType][endDate].gamesStarted,
                "inningsPitched": player[statsType][endDate].inningsPitched,
                "wins": player[statsType][endDate].wins,
                "losses": player[statsType][endDate].losses,
                "era": player[statsType][endDate].era,
                "whip": player[statsType][endDate].whip,
                "saves": player[statsType][endDate].saves,
                "holds": player[statsType][endDate].holds,
                "hits": player[statsType][endDate].hits,
                "homeRuns": player[statsType][endDate].homeRuns,
                "earnedRuns": player[statsType][endDate].earnedRuns,
                "strikeOuts": player[statsType][endDate].strikeOuts,
                "baseOnBalls": player[statsType][endDate].baseOnBalls
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