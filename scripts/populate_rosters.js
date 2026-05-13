require("dotenv").config();
const fs = require("fs");
const {connectToDatabase, closeConnection} = require("../utils/db");
const argv = require("yargs")
    .option("local", {
        type: "boolean",
        default: false,
        describe: "do not write to mongo (write local file)"
    })
    .option("collection", {
        type: "string",
        default: "players",
        describe: "name of MongoDB collection to populate",
    })
    .option("startYear", {
        type: "string",
        default: "2007",
        describe: "first year of rosters to check"
    })
    .option("endYear", {
        type: "string",
        default: "2026",
        describe: "last year of rosters to check"
    }).argv;

const MLB_API = process.env.MLB_API;

const local = argv.local;
const collectionName = argv.collection;
const startYear = argv.startYear;
const endYear = argv.endYear;

async function populateRosters() {

    const playersData = {};

    for (let season = startYear; season <= endYear; season++) {
        console.log(`Getting Blue Jays stats for season ${season}`);

        const seasonURL = `${MLB_API}/api/v1/teams/141/roster/fullRoster?season=${season}`;

        try {
            const response = await fetch(seasonURL);
            if (!response.ok) throw new Error(`Could not fetch ${seasonURL}`);

            const data = await response.json();

            for (const player of data.roster) {

                if (!playersData.hasOwnProperty(player.person.id)) {
                    // add player to data
                    playersData[player.person.id] = {
                        "_id": player.person.id,
                        "link": player.person.link,
                        "fullName": player.person.fullName,
                        "position": player.position.name
                    }
                }

            }
        } catch (error) {
            console.error(error);
        }

    }
    if (local) {
        fs.writeFile("output/player_list.json", JSON.stringify(playersData, null, 2), (err) => {
            if (err) {
                console.error(err);
            }
            console.log("Wrote players list to file");
        });
    } else {
        const dbInstance = await connectToDatabase("exbluejays");
        const collection = dbInstance.collection(collectionName);
        // write documents that are not already in the collection
        const insertions = Object.values(playersData).map(doc => ({
                "updateOne": {
                    "filter": {
                            "_id": doc._id
                    },
                    "update": {
                            "$setOnInsert": doc
                        },
                    "upsert": true
                }
            }
        ));
        const result = await collection.bulkWrite(insertions);
        console.log(`Inserted ${result.upsertedCount} players in ${collectionName}`);
    }
    await closeConnection();
}

populateRosters();