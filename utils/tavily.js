const { tavily } = require("@tavily/core");

const client = tavily({
    apiKey: process.env["TAVILY_API_KEY"]
});

async function askTavily(query, startDate, endDate, domains) {
    try {

        const response = await client.search(query, {
            topic: "news",
            searchDepth: "advanced",
            maxResults: 3,
            startDate: startDate,
            endDate: endDate,
            includeDomains: domains,
            chunksPerSource: 3
        });

        return response;

    } catch (error) {
        console.error("Unexpected error:", error);
    }
}


function buildQuery(player) {
    // generate the query for asking tavily
    return `Find the latest baseball news about ${player.fullName} who plays ${player.position} for the ${player.latest_team}`;
}


module.exports = { askTavily, buildQuery };