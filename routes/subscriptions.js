const express = require('express');
const {connectToDatabase} = require("../utils/db");

const router = express.Router();

router.get("/subscribe", (req, res) => {
    const csrfToken = req.csrfToken();
    res.render("subscribe",
        {
            "method": "get",
            "csrfToken": csrfToken
        });
});

router.post("/subscribe", async (req, res) => {
    let message;
    const emailAddress = req.body.email_address;
    // process form, add address to mongo etc.
    const dbInstance = await connectToDatabase("exbluejays");
    const subscribers = dbInstance.collection("subscribers");
    const existingMatches = await subscribers.find({"email": emailAddress}).toArray();
    if (existingMatches.length > 0 && existingMatches[0].active) {
        message = `${emailAddress} is already subscribed.`;
    } else {
        const result = await subscribers.updateOne(
            {
                "email": emailAddress
            },
            {
                "$set": {
                    "activated": new Date(),
                    "active": true
                },
                "$unset": {
                    "deactivated": ""
                }
            },
            {
                "upsert": true
            });
        message = `${emailAddress} is now subscribed.`
    }

    res.render("subscribe", {
        "method": "post",
        "message": message
    });
});

router.get("/unsubscribe", (req, res) => {
    const emailAddress = req.query.emailAddress;
    const csrfToken = req.csrfToken();
    res.render("unsubscribe",
        {
            "method": "get",
            "emailAddress": emailAddress,
            "csrfToken": csrfToken
        });
});

router.post("/unsubscribe", async (req, res) => {
    let message;
    const emailAddress = req.body.email_address;
    // process form, add address to mongo etc.
    const dbInstance = await connectToDatabase("exbluejays");
    const subscribers = dbInstance.collection("subscribers");
    const existingMatches = await subscribers.find({"email": emailAddress}).toArray();
    if (existingMatches.length === 0 || !existingMatches[0].active) {
        message = `${emailAddress} is not currently subscribed`;
    } else {
        const result = await subscribers.updateOne(
            {
                "email": emailAddress
            },
            {
                "$set": {
                    "deactivated": new Date(),
                    "active": false
                }
            });
        message = `${emailAddress} is now unsubscribed.  You are now an ex-Ex-Blue Jays Report subscriber!`
    }

    res.render("unsubscribe", {
        "method": "post",
        "message": message
    });
});

router.get("/privacy", (req, res) => {
    res.render("privacy");
});

module.exports = router;