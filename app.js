require("dotenv").config();
const express = require('express');
const {connectToDatabase} = require("./utils/db");
const {buildTables} = require("./utils/tables");
const {teamAbbMap} = require("./utils/mlb");

const app = express();
app.set('view engine', 'ejs');

// Parse JSON bodies
app.use(express.json());

// (temporary) local file with player data
// const playersData = require('./data/players_with_activity.json');

// const currentYear = new Date().getFullYear().toString();

// function to filter players
// const filterPlayers = (how) => {
//     if (how === "current") {
//         // get current Jays
//         return Object.fromEntries(
//             Object.entries(playersData).filter(([id, player]) => {
//                 return (player.active
//                     && player.years_with_jays.includes(currentYear)
//                     && player.latest_team.includes("Toronto"));
//             }));
//     } else if (how === "ex") {
//         // get active former Jays
//         return Object.fromEntries(
//             Object.entries(playersData).filter(([id, player]) => {
//                 return (player.active
//                     && player.years_with_jays.length > 0
//                     && !player.latest_team.includes("Toronto"));
//             }));
//     }
// };

app.use(express.static("public"));

app.get("/", async (req, res) => {
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

app.get("/report", async (req, res) => {
    let endDate = req.query.endDate;
    let statsType;
    let ytd;
    if (req.query.ytd === "true") {
        statsType = "ytd";
        ytd = true;
    } else {
        statsType = "stats";
        ytd = false;
    }

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
    })

    if (endDate === undefined) {
        // if no date specified, use latest
        endDate = endDates[0];
    }

    const { hitters, pitchers } = await buildTables(dbInstance, statsType, endDate);

    const endDateString = new Date(endDate).toLocaleDateString('en-US',
        {weekday: "long", month: "long", day: "numeric", timeZone: "UTC"}
    );

    console.log(`Returning ${hitters.length} ex Blue Jay hitters and ${pitchers.length} ex Blue Jay pitchers.`);

    res.render('report',
        {
            endDate: endDateString,
            endDates: endDates,
            teamAbbMap: teamAbbMap,
            hitters: hitters,
            pitchers: pitchers,
            ytd: ytd
        });
});

app.get('/db', async (req, res) => {
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

app.listen(process.env.PORT || 3000, () => {
    console.log("Server running on port 3000");
});
