
// catch CSRF errors
const handleCsrfError = (error, req, res, next) => {
    if (error.code === "EBADCSRFTOKEN") {
        // Redirect back to the form with an error message
        return res.status(403).render('subscribe', {
            csrfToken: req.csrfToken(),
            error: "Your session has expired. Please try again."
        });
    }
    // Pass other errors to the default handler
    next(error);
};

const handleMongoError = (error, req, res, next) => {
    if (error.name === "MongoNetworkError") {
        return res.status(503).send("Database is currently unavailable.");
    }
    next(error);
};

const handleGlobalError = (error, req, res, next) => {
    console.error(err);
    res.redirect("back");
};

module.exports = { handleCsrfError, handleMongoError, handleGlobalError };