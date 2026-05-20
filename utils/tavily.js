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
            includeRawContent: "text",
            includeDomains: domains,
            chunksPerSource: 1
        });

        return response;

    } catch (error) {
        console.error("Unexpected error:", error);
    }
}


function buildQuery(name) {
    // generate the query for asking tavily
    return `Find the most interesting career news about ${name}.`;
}


module.exports = { askTavily, buildQuery };