const { MongoClient, ServerApiVersion } = require('mongodb');
const MONGO_USER = process.env.MONGO_USER;
const MONGO_PASS = process.env.MONGO_PASS;
const MONGO_SRV = process.env.MONGO_SRV;
const MONGO_APP = process.env.MONGO_APP;
const mongo_uri = `mongodb+srv://${MONGO_USER}:${MONGO_PASS}@${MONGO_SRV}/?appName=${MONGO_APP}`;

// Ensure crypto is available globally
if (!global.crypto) {
    global.crypto = require('crypto');
}
let dbInstance = null;
let client = null;

// function to connect to database
async function connectToDatabase(dbname) {
    if (dbInstance) {
        return dbInstance;
    }
    client = new MongoClient(mongo_uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        },
        family: 4
    });
    await client.connect();
    dbInstance = client.db(dbname);
    console.log(`Connected to Database: ${dbname}`);

    // Register shutdown handler only once
    process.on('SIGINT', async () => {
        await client.close();
        console.log('MongoDB connection closed');
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        await client.close();
        console.log('MongoDB connection closed');
        process.exit(0);
    });

    return dbInstance;
}

async function closeConnection() {
    if (client) {
        await client.close();
    }
}

module.exports = { connectToDatabase, closeConnection };