const Cerebras = require("@cerebras/cerebras_cloud_sdk");
const jsonToMarkdown = require("json-to-markdown-table");

const client = new Cerebras({
    apiKey: process.env["CEREBRAS_API_KEY"],
});

async function askCerebras(content, max_completion_tokens=1024, temperature=0.2) {
    try {

        const response = await client.chat.completions.create({
            model: process.env["CEREBRAS_MODEL"],
            max_completion_tokens: max_completion_tokens,
            temperature: temperature,
            stream: false,
            messages: [
                {
                    role: "user",
                    content: content
                }
            ]
        });

        return response;

    } catch (error) {
        if (error instanceof Cerebras.APIError) {
            console.error("API Error: ", error.status, error.name, error.message);
        } else {
            console.error("Unexpected error:", error);
        }
    }
}

function buildPrompt(hitters_week, hitters_ytd, pitchers_week, pitchers_ytd,
                     schedule, notes=null, news=null) {
    // generate the content for asking cerebras

    const scheduleString = Object.values(schedule).map(row => {
        return (`\n- ${row.phrase} ${row.opponent} at ${row.venue} from ${row.from_date} to ${row.to_date}`
                + " where they might face "
                + (row.exArms.length > 0 ? `ex arms ${row.exArms.join(",")}` : "")
                + (row.exBats.length > 0 ? `ex bats ${row.exBats.join(",")}` : ""));
    });

    const notes_string = (notes?.length > 0 ? `\nHere are some team change notes:\n ${notes.join("\n")}` : "There are no team change notes.");

    let prompt = `Your name is Mister Ex and you are an old timey sports reporter whose beat is former Toronto Blue Jays.
    
    Here are statistics for some former Toronto Blue Jays players for the last week.  The
    column "ex_since" represents the last year they played with Toronto and JGP the number of games played as a Blue Jay in their career.
    
    Hitters:
    ${jsonToMarkdown(hitters_week, Object.keys(hitters_week[0]))}
    
    Pitchers:
    ${jsonToMarkdown(pitchers_week, Object.keys(pitchers_week[0]))}
    
    and here are some stats for the season up to now:
    
    Hitters:
    ${jsonToMarkdown(hitters_ytd, Object.keys(hitters_ytd[0]))}
    
    Pitchers:
    ${jsonToMarkdown(pitchers_ytd, Object.keys(pitchers_ytd[0]))}
    
    The Blue Jays' schedule for the next week is: 
    ${scheduleString.join("\n")}
    
    ${notes_string}
    
    In three or four sentences, please summarize the outstanding performances from the past week.
    
    If there are any team-change notes, please mention them.
    
    Emphasize players with higher number of career games played as a Blue Jay (JGP).
    
    In a sentence or two, mention the best hitters and pitchers of the season so far.
    
    In a final sentence, mention the Blue Jays' opponents for the next week and any former teammates they might
    face in those series. 
    
    Please use the style of a 1950s sports report.
    
    Please do not accidentally say any of the players are still with the Blue Jays.
    
    Introduce yourself at the beginning but do not actually use the word old-timey.
    
    Please be careful not to invent statistics or misread the tables.
    
    Try to work in the year the players last played for Toronto and how they are fondly remembered.`

    return prompt
}


module.exports = { askCerebras, buildPrompt };
