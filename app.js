require("dotenv").config();
const express = require('express');
const csrf = require("tiny-csrf");
const cookieParser = require('cookie-parser');
const {connectToDatabase} = require("./utils/db");
const {buildTables} = require("./utils/tables");
const {teamAbbMap} = require("./utils/mlb");
const routes = require("./routes/routes");

const app = express();
app.set('view engine', 'ejs');

// CSRF protection
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(process.env.COOKIE_SECRET));
const csrfProtection = csrf(process.env.CSRF_SECRET);
app.use(csrfProtection);

// Parse JSON bodies
app.use(express.json());

app.use(express.static("public"));

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Internal Server Error');
});

app.use("/", routes);

app.listen(process.env.PORT || 3000, () => {
    console.log("Server running on port 3000");
});
