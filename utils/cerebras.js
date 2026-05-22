const Cerebras = require("@cerebras/cerebras_cloud_sdk");
const jsonToMarkdown = require("json-to-markdown-table");

const client = new Cerebras({
    apiKey: process.env["CEREBRAS_API_KEY"],
});

async function askCerebras(content, response_format=null, temperature=0.2, max_completion_tokens=1024) {
    try {
        const response = await client.chat.completions.create({
            model: process.env["CEREBRAS_MODEL"],
            max_completion_tokens: max_completion_tokens,
            temperature: temperature,
            stream: false,
            response_format: response_format,
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
        return {"error": error};
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

    let news_string = "";
    if (news?.length > 0) {
        news_string += "Here is a survey of news about some ex-Blue Jays that might inform your summary:";
        for (newsItem of news) {
            news_string += `\n- ${newsItem.shortDate}: ${newsItem.summary}`;
        }
    }

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
    
    In three to five sentences, please summarize the outstanding performances from the past week.  
    Use past tense to describe the past week.
    
    ${news_string}
    
    Emphasize players with higher number of career games played as a Blue Jay (JGP).
    
    In a sentence or two, mention the best hitters and pitchers of the season so far.
    
    In a final sentence, mention the Blue Jays' opponents for the next week and any former teammates they might
    face in those series. 
    
    Please use the style of a 1950s sports report.
    
    Please do not accidentally say any of the players are still with the Blue Jays.
    
    Introduce yourself at the beginning but do not actually use the word old-timey.
    
    Please be careful not to invent statistics or misread the tables.
    
    Try to work in the year the players last played for Toronto and how they are fondly remembered.`;

    return prompt;
}


async function rateNews(content, player) {
    // evaluate the submitted news
    let prompt = `Consider the news article text below.
    
    ------------------
    
    ${content}
    
    ------------------
      
    Please assess whether or not it is newsworthy information about player ${player.fullName}.
    
    Categorize the information as one of the following:
    
    - GREAT GAME
    - AWARD
    - INJURY
    - CAREER
    - NON-BASEBALL
    - OTHER
    
    Please rate the newsworthiness on a scale of 0 to 10 using the EXAMPLES below as a reference:
    
    - ${player.fullName} hit a home run and had multiple RBI (rating 7 / GREAT GAME)
    - ${player.fullName} had a quality start (rating 6 / GREAT GAME)
    - ${player.fullName} had the game-winning hit (rating 5 / GREAT GAME)
    - ${player.fullName} had a notable performance in a game (rating 4 / GREAT GAME)
    - ${player.fullName} went on or came of the injured list (rating 5 / INJURY)
    - ${player.fullName} won an award such as player of the week or player of the month (rating 8 / AWARD)
    - ${player.fullName} was named to all-star team (rating 8 / AWARD)
    - ${player.fullName} won an end-of-season award (rating 10 / AWARD)
    - ${player.fullName} announced his retirement (rating 10 / CAREER)
    - ${player.fullName} was traded or signed as a free agent with a new team (rating 8 / CAREER)
    - ${player.fullName} was released by his team (rating 6 / CAREER)
    - ${player.fullName} was hired in a coaching or managerial role (rating 8 / NON-BASEBALL)
    - ${player.fullName} was mentioned in a game summary but not in a starring role (rating 2 / GREAT GAME)
    - ${player.fullName} discussing personal experiences or struggles (rating 2 / NON-BASEBALL)
    - ${player.fullName} not mentioned by name (rating 0 / OTHER)
    - ${player.fullName} was mentioned in a rumoured or speculated trade (rating 1 / CAREER)
    
    DO NOT BE LIBERAL WITH RATINGS OF 5 OR HIGHER.  Save them for truly noteworthy news ABOUT ${player.fullName}.
    
    BE CAREFUL NOT TO CONFUSE PLAYERS WITH THE SAME FIRST NAME OR SAME LAST NAME.  Only consider news about ${player.fullName}.
    
    Give a short explanation for your newsworthiness rating.
    
    Finally, please summarize the information in the article pertaining to ${player.fullName} in one or two detailed sentences.
    If the article category is GREAT GAME, please mention the opponent and the result of the game.`;

    const response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "news_rating",
            "schema": {
                "type": "object",
                "properties": {
                    "category": {"type": "string"},
                    "rating": {"type": "number"},
                    "rating_explanation": {"type": "string"},
                    "summary": {"type": "string"}
                },
                "required": ["category", "rating", "rating_explanation", "summary"],
                "additionalProperties": false
            },
            "strict": true
        }
    };

    return await askCerebras(prompt, response_format);
}


module.exports = { askCerebras, buildPrompt, rateNews };
