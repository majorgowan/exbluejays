require("dotenv").config();
const {connectToDatabase, closeConnection} = require("../utils/db");
const argv = require('yargs')
    .option("collection", {
        type: "string",
        default: "taps",
        describe: "mongodb collection to update"
    })
    .option("document", {
        type: "string",
        describe: "document (name) to update",
    }).argv;

const collectionName = argv.collection;
let documentName = argv.document;

if (!documentName) {
    // use today's date
    documentName = new Date().toISOString().split("T")[0];
}

async function tap_mongo(collection, document) {
    const dbInstance = await connectToDatabase("exbluejays");

    const tapsCollection = dbInstance.collection(collection);

    const result = await tapsCollection.updateOne(
        {
            "name": document,
        },
        {
            "$push": {
                "taps": new Date()
            }
        },
        {
            "upsert": true
        });
    console.log(result);

    // close MongoDB connection
    await closeConnection();
}

tap_mongo(collectionName, documentName);
