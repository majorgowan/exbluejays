const express = require('express');
const { connectToDatabase } = require("../utils/db");
const { renderEmail, sendEmail } = require("../utils/email");
const { generateRandomString } = require("../utils/utils");

const router = express.Router();


router.get("/subscribe", (req, res) => {
    const emailAddress = req.query.email || "";
    const csrfToken = req.csrfToken();
    res.render("subscribe",
        {
            "method": "get",
            "email": emailAddress,
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
        const token = generateRandomString(32);
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 1);
        const result = await subscribers.updateOne(
            {
                "email": emailAddress
            },
            {
                "$set": {
                    "active": false,
                    "confirmed": false,
                    "token": token,
                    "token_expiry": expiry,
                },
                "$unset": {
                    "deactivated": ""
                }
            },
            {
                "upsert": true
            });
        console.log(result);
        message = `${emailAddress} is now subscribed pending confirmation.  Check your inbox bzw. spam folder for a confirmation request.`

        // send confirmation email
        const confirmationUrl = `https://exbluejays.ca/confirm?email=${emailAddress}&token=${token}`;
        const locals = {
            "email": emailAddress,
            "token_expiry": expiry.toISOString(),
            "confirmation_url": confirmationUrl,
            "business_address": process.env.BUSINESS_ADDRESS
        }
        const html = await renderEmail("confirmation_email", locals);
        const emailData = {
            "to": emailAddress,
            "from": process.env.EMAIL_SENDER_ADDRESS,
            "subject": "Confirm your email for Ex-Blue Jays report",
            "html": html,
            "h:Reply-To": process.env.EMAIL_REPLYTO_ADDRESS
        }
        await sendEmail(emailData);
    }

    res.render("subscribe", {
        "method": "post",
        "message": message
    });
});


router.get("/unsubscribe", (req, res) => {
    const emailAddress = req.query.email;
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
        console.log(result);
        message = `${emailAddress} is now unsubscribed.  You are now an ex-Ex-Blue Jays Report subscriber!`
    }

    res.render("unsubscribe", {
        "method": "post",
        "message": message
    });
});


router.get("/confirm", async (req, res) => {
    let message;
    let retry = false;
    const emailAddress = req.query.email;
    const confirmationToken = req.query.token;
    const dbInstance = await connectToDatabase("exbluejays");
    const subscribers = dbInstance.collection("subscribers");
    const findMatch = await subscribers.findOne(
        {
            "email": emailAddress,
        }
    );
    if (!findMatch) {
        message = "Confirmation unsuccessful.  Unrecognized email address.";
        retry = true;
    } else {
        const now = new Date();
        console.log(findMatch);
        if (findMatch.confirmed) {
            // address is already confirmed
            message = `${emailAddress} is already confirmed.`;
        } else {
            if (findMatch.token !== confirmationToken) {
                message = "Confirmation unsuccessful.  Incorrect token.";
                retry = true;
            } else if (now > findMatch.token_expiry) {
                message = "Confirmation unsuccessful.  Token expired.";
                retry = true;
            } else {
                // confirmation successful
                message = `${emailAddress} is now confirmed.  Remember to check your spam folder every Tuesday!`;
                // update the database
                const result = await subscribers.updateOne(
                    {
                        "email": emailAddress
                    },
                    {
                        "$set": {
                            "confirmed": true,
                            "activated": new Date(),
                            "active": true
                        },
                        "$unset": {
                            "deactivated": ""
                        }
                    }
                )
                console.log(result);
            }
        }
    }
    res.render("confirm", {
        "method": "get",
        "message": message,
        "email": emailAddress,
        "retry": retry,
    });
});


router.get("/privacy", (req, res) => {
    res.render("privacy");
});

module.exports = router;