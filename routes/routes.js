const express = require('express');
const { connectToDatabase } = require("../utils/db");
const { buildTables, buildSeries, buildSummary, buildNews } = require("../utils/builders");
const { teamAbbMap} = require("../utils/mlb");
const { dateStringToString } = require("../utils/utils");

const router = express.Router();


router.get("/", async (req, res) => {
    const dbInstance = await connectToDatabase("exbluejays");

    // get list of weekly reports
    const datesArray = await dbInstance.collection("reports").find(
        {},
        {
            "sort": {"endDate": -1},
            "projection": {"endDate": 1}
        }
    ).toArray();
    const endDates = datesArray.map((date) => {
        return date.endDate;
    });

    res.redirect(`/report?endDate=${endDates[0]}`);
});


router.get("/home", async (req, res) => {
    const dbInstance = await connectToDatabase("exbluejays");

    // get list of weekly reports
    const datesArray = await dbInstance.collection("reports").find(
        {},
        {
            "sort": {"endDate": -1},
            "projection": {"endDate": 1}
        }
    ).toArray();
    const endDates = datesArray.map((date) => {
        return {
            "endDate": date.endDate,
            "endDateString": dateStringToString(date.endDate)
        };
    });

    res.render('index',
        {
            "endDates": endDates
        });
});


router.get("/report", async (req, res) => {
    let endDate = req.query.endDate;
    let statsType;

    const dbInstance = await connectToDatabase("exbluejays");

    // get list of weekly reports
    const datesArray = await dbInstance.collection("reports").find(
        {},
        {
            "sort": {"endDate": -1},
            "projection": {"endDate": 1}
        }
    ).toArray();
    const endDates = datesArray.map((date) => {
        return {
            "endDate": date.endDate,
            "endDateString": dateStringToString(date.endDate)
        };
    });

    if (endDate === undefined) {
        // if no date specified, use latest
        endDate = endDates[0];
    }

    // const { hitters, pitchers } = await buildTables(dbInstance, statsType, endDate);
    const { hitters: hitters_week, pitchers: pitchers_week } = await buildTables(dbInstance, "stats", endDate);
    const { hitters: hitters_ytd, pitchers: pitchers_ytd } = await buildTables(dbInstance, "ytd", endDate);

    const schedule = await buildSeries(dbInstance, endDate);
    const summary = await buildSummary(dbInstance, endDate);
    const news = await buildNews(dbInstance, endDate, 4);

    const endDateString = new Date(endDate).toLocaleDateString('en-US',
        {weekday: "short", month: "long", day: "numeric", timeZone: "UTC"}
    );

    console.log(`Returning ${hitters_week.length} ex Blue Jay hitters and ${pitchers_week.length} ex Blue Jay pitchers.`);

    res.render('report',
        {
            endDate: endDate,
            endDates: endDates,
            endDateString: endDateString,
            teamAbbMap: teamAbbMap,
            hitters_week: hitters_week,
            hitters_ytd: hitters_ytd,
            pitchers_week: pitchers_week,
            pitchers_ytd: pitchers_ytd,
            schedule: schedule,
            summary: summary,
            news: news,
            players_url: process.env.PLAYERS_URL
        });
});

router.get("/db/:player", async (req, res) => {
    const dbInstance = await connectToDatabase("exbluejays");
    const player_pattern = req.params.player;
    const playersArray = await dbInstance.collection("players").find(
        {
            "fullName": {
                "$regex": player_pattern
            }
        }).toArray();
    res.json(playersArray);
});


module.exports = router;