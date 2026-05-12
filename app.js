require("dotenv").config();
const express = require('express');
const csrf = require("tiny-csrf");
const cookieParser = require('cookie-parser');
const routes = require("./routes/routes");
const subscriptionRoutes = require("./routes/subscriptions");
const { handleCsrfError, handleMongoError } = require("./routes/errors");

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

// Routes
app.use("/", routes);
app.use("/", subscriptionRoutes);

// Error handlers
app.use(handleCsrfError);
app.use(handleMongoError);

app.listen(process.env.PORT || 3000, () => {
    console.log("Server running on port 3000");
});
