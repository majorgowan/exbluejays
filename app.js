require("dotenv").config();
const express = require('express');
const {connectToDatabase} = require("./utils/db");
const {buildTables} = require("./utils/tables");
const {teamAbbMap} = require("./utils/mlb");

const routes = require("./routes/routes");

const app = express();
app.set('view engine', 'ejs');

// Parse JSON bodies
app.use(express.json());

app.use(express.static("public"));

app.use("/", routes);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Internal Server Error');
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Server running on port 3000");
});
