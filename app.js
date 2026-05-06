require("dotenv").config();
const express = require('express');
const { connectToDatabase } = require("./db/db");

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
    // serve filtered or unfiltered data
    const players = Object.values(filterPlayers("ex"));
    console.log(`Returning ${players.length} ex Blue Jays.`);
    res.render('report', { players: players });
});

app.get('/db', async (req, res) => {
    const dbInstance = await connectToDatabase("exbluejays");
    console.log(dbInstance);
    const playersArray = await dbInstance.collection("players").find({}).toArray();
    console.log(playersArray);
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
    res.json({"inserted": result.insertedCount,
                   "totalDocs": await playersCollection.countDocuments()});
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
