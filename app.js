require("dotenv").config();
const express = require('express');
const {connectToDatabase} = require("./db/db");

const app = express();
app.set('view engine', 'ejs');

// Parse JSON bodies
app.use(express.json());

const playersData = require('./data/players_with_activity.json');
const currentYear = new Date().getFullYear().toString();

// function to filter players
const filterPlayers = (how) => {
    if (how === "current") {
        // get current Jays
        return Object.fromEntries(
            Object.entries(playersData).filter(([id, player]) => {
                return (player.active
                    && player.years_with_jays.includes(currentYear)
                    && player.latest_team.includes("Toronto"));
            }));
    } else if (how === "ex") {
        // get active former Jays
        return Object.fromEntries(
            Object.entries(playersData).filter(([id, player]) => {
                return (player.active
                    && player.years_with_jays.length > 0
                    && !player.latest_team.includes("Toronto"));
            }));
    }
};

app.use(express.static("public"));

app.get("/", (req, res) => {
    res.render("index");
});

app.get('/data', (req, res) => {
    // serve filtered or unfiltered data
    const allOrSome = req.query.all;
    console.log(allOrSome);
    if (allOrSome === "all") {
        res.json(playersData);
    } else {
        // current or ex Blue Jays
        const filteredList = filterPlayers(allOrSome);
        console.log(`Returning ${Object.entries(filteredList).length} ${allOrSome} Blue Jays.`);
        res.json(filteredList);
    }
});

app.get('/exJays', (req, res) => {
    const players = Object.values(filterPlayers("ex"));
    console.log(`Returning ${players.length} ex Blue Jays.`);
    res.render('exjays', {players: players});
});

app.get('/report', async (req, res) => {
    let endDate = req.query.endDate;
    const dbInstance = await connectToDatabase("exbluejays");
    // if no date specified, get the latest stats from Mongo
    if (endDate === undefined) {
        const lastDate = await dbInstance.collection("players").aggregate([
            {
                "$match": {
                    "stats": {
                        "$exists": true
                    }
                }
            },
            {
                "$project": {
                    "keys": {
                        "$objectToArray": "$stats"
                    }
                }
            },
            {
                "$unwind": "$keys"
            },
            {
                "$group": {
                    "_id": null,
                    "lastDate": {
                        "$max": "$keys.k"
                    }
                }
            }
        ]).toArray();
        endDate = lastDate[0].lastDate;
    }
    // retrieve stats for specified date
    const playersArray = await dbInstance.collection("players").aggregate([
        {
            "$match": {
                [`stats.${endDate}`]: {"$exists": true}
            }
        },
        {
            "$project": {
                "_id": 1,
                "fullName": 1,
                "position": 1,
                "latest_team": 1,
                [`stats.${endDate}`]: 1,
                "years_with_jays": 1
            }
        },
        {
            "$sort": {
                [`stats.${endDate}.ops`]: -1
            }
        }
    ]).toArray();
    // build hitters table
    const hitters = await playersArray
        .filter(player => {
            return (player.position !== "Pitcher");
        }).map(player => {
            return {
                "_id": player._id,
                "name": player.fullName,
                "position": player.position,
                "team": player.latest_team,
                "ex_since": player.years_with_jays.at(-1),
                "gamesPlayed": player.stats[endDate].gamesPlayed,
                "atBats": player.stats[endDate].atBats,
                "avg": player.stats[endDate].avg,
                "obp": player.stats[endDate].obp,
                "slg": player.stats[endDate].slg,
                "ops": player.stats[endDate].ops,
                "hits": player.stats[endDate].hits,
                "runs": player.stats[endDate].runs,
                "homeRuns": player.stats[endDate].homeRuns,
                "rbi": player.stats[endDate].rbi,
                "strikeOuts": player.stats[endDate].strikeOuts,
                "baseOnBalls": player.stats[endDate].baseOnBalls,
                "stolenBases": player.stats[endDate].stolenBases,
                "groundIntoDoublePlay": player.stats[endDate].groundIntoDoublePlay,
                "plateAppearances": player.stats[endDate].plateAppearances
            };
        });

    // build pitchers table
    const pitchers = await playersArray
        .filter(player => {
            return (player.position === "Pitcher");
        }).map(player => {
            return {
                "_id": player._id,
                "name": player.fullName,
                "team": player.latest_team,
                "ex_since": player.years_with_jays.at(-1),
                "gamesPitched": player.stats[endDate].gamesPitched,
                "gamesStarted": player.stats[endDate].gamesStarted,
                "inningsPitched": player.stats[endDate].inningsPitched,
                "wins": player.stats[endDate].wins,
                "losses": player.stats[endDate].losses,
                "era": player.stats[endDate].era,
                "whip": player.stats[endDate].whip,
                "saves": player.stats[endDate].saves,
                "holds": player.stats[endDate].holds,
                "hits": player.stats[endDate].hits,
                "homeRuns": player.stats[endDate].homeRuns,
                "earnedRuns": player.stats[endDate].earnedRuns,
                "strikeOuts": player.stats[endDate].strikeOuts,
                "baseOnBalls": player.stats[endDate].baseOnBalls
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

    const endDateString = new Date(endDate).toLocaleDateString('en-US',
        {weekday: "long", month: "long", day: "numeric"}
    );

    console.log(`Returning ${hitters.length} ex Blue Jay hitters and ${pitchers.length} ex Blue Jay pitchers.`);
    res.render('report',
        {
            endDate: endDateString,
            hitters: hitters,
            pitchers: pitchers
        });
});

app.get('/db', async (req, res) => {
    const dbInstance = await connectToDatabase("exbluejays");
    const playersArray = await dbInstance.collection("players").find({}).toArray();
    res.json(playersArray);
});

app.post('/populate', async (req, res) => {
    const dbInstance = await connectToDatabase("exbluejays");
    const how = req.body.how;
    const players = filterPlayers(how);
    const documentsToInsert = Object.entries(players).map(([id, player]) => {
        return {"_id": id, ...player};
    });
    const playersCollection = dbInstance.collection("players");
    const result = await playersCollection.insertMany(documentsToInsert,
        {"ordered": false});
    res.json({
        "inserted": result.insertedCount,
        "totalDocs": await playersCollection.countDocuments()
    });
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
