const express = require('express');
const { connectToDatabase } = require("../utils/db");
const { buildTables, buildSeries, buildSummary } = require("../utils/builders");
const { teamAbbMap} = require("../utils/mlb");

const router = express.Router();


router.get("/", async (req, res) => {
    const dbInstance = await connectToDatabase("exbluejays");

    // get list of weekly reports
    const datesArray = await dbInstance.collection("reports").find(
        {},
        {
            "sort": {"endDate": -1},
            "projection": {"endDate": 1}
        }
    ).toArray();
    const endDates = datesArray.map((date) => {
        return date.endDate;
    });

    res.render('index',
        {
            "endDates": endDates
        });
});

// app.get('/data', (req, res) => {
//     // serve filtered or unfiltered data
//     const allOrSome = req.query.all;
//     console.log(allOrSome);
//     if (allOrSome === "all") {
//         res.json(playersData);
//     } else {
//         // current or ex Blue Jays
//         const filteredList = filterPlayers(allOrSome);
//         console.log(`Returning ${Object.entries(filteredList).length} ${allOrSome} Blue Jays.`);
//         res.json(filteredList);
//     }
// });

// app.get('/roster', (req, res) => {
//     const players = Object.values(filterPlayers("ex"));
//     console.log(`Returning ${players.length} ex Blue Jays.`);
//     res.render('roster', {players: players});
// });

router.get("/report", async (req, res) => {
    let endDate = req.query.endDate;
    let statsType;

    const dbInstance = await connectToDatabase("exbluejays");

    // get list of weekly reports
    const datesArray = await dbInstance.collection("reports").find(
        {},
        {
            "sort": {"endDate": -1},
            "projection": {"endDate": 1}
        }
    ).toArray();
    const endDates = datesArray.map((date) => {
        return date.endDate;
    });

    if (endDate === undefined) {
        // if no date specified, use latest
        endDate = endDates[0];
    }

    // const { hitters, pitchers } = await buildTables(dbInstance, statsType, endDate);
    const { hitters: hitters_week, pitchers: pitchers_week } = await buildTables(dbInstance, "stats", endDate);
    const { hitters: hitters_ytd, pitchers: pitchers_ytd } = await buildTables(dbInstance, "ytd", endDate);

    const schedule = await buildSeries(dbInstance, endDate);
    const summary = await buildSummary(dbInstance, endDate);

    const endDateString = new Date(endDate).toLocaleDateString('en-US',
        {weekday: "long", month: "long", day: "numeric", timeZone: "UTC"}
    );

    console.log(`Returning ${hitters_week.length} ex Blue Jay hitters and ${pitchers_week.length} ex Blue Jay pitchers.`);

    res.render('report',
        {
            endDate: endDate,
            endDates: endDates,
            endDateString: endDateString,
            teamAbbMap: teamAbbMap,
            hitters_week: hitters_week,
            hitters_ytd: hitters_ytd,
            pitchers_week: pitchers_week,
            pitchers_ytd: pitchers_ytd,
            schedule: schedule,
            summary: summary,
            players_url: process.env.PLAYERS_URL
        });
});

router.get("/db", async (req, res) => {
    const dbInstance = await connectToDatabase("exbluejays");
    const playersArray = await dbInstance.collection("players").find({}).toArray();
    res.json(playersArray);
});

// app.post('/populate', async (req, res) => {
//     const dbInstance = await connectToDatabase("exbluejays");
//     const how = req.body.how;
//     const players = filterPlayers(how);
//     const documentsToInsert = Object.entries(players).map(([id, player]) => {
//         return {"_id": id, ...player};
//     });
//     const playersCollection = dbInstance.collection("players");
//     const result = await playersCollection.insertMany(documentsToInsert,
//         {"ordered": false});
//     res.json({
//         "inserted": result.insertedCount,
//         "totalDocs": await playersCollection.countDocuments()
//     });
// });

module.exports = router;