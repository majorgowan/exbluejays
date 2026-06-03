const Cerebras = require("@cerebras/cerebras_cloud_sdk");
const jsonToMarkdown = require("json-to-markdown-table");

const client = new Cerebras({
    apiKey: process.env.CEREBRAS_API_KEY,
    maxRetries: 8
});

async function askCerebras(content, response_format=null, reasoning_effort="low", max_completion_tokens=1024, temperature=0.2) {
    try {
        const response = await client.chat.completions.create({
            model: process.env.CEREBRAS_MODEL,
            max_completion_tokens: max_completion_tokens,
            temperature: temperature,
            stream: false,
            response_format: response_format,
            reasoning_effort: reasoning_effort,
            messages: [
                {
                    role: "user",
                    content: content
                }
            ]
        });

        return response;

    } catch (error) {
        console.error("Error: ", error.status, error.name, error.message);
        throw error;
    }
}


function buildPrompt(hitters_week, hitters_ytd, pitchers_week, pitchers_ytd,
                     schedule, news=null, transactions=null) {
    // generate the content for asking cerebras

    const scheduleString = Object.values(schedule).map(row => {
        return (`\n- ${row.phrase} ${row.opponent} at ${row.venue} from ${row.from_date} to ${row.to_date}`
                + " where they might face "
                + (row.exArms.length > 0 ? `ex arms ${row.exArms.join(",")}` : "")
                + (row.exBats.length > 0 ? `ex bats ${row.exBats.join(",")}` : ""));
    });

    let newsString = "";
    if (news) {
        newsString += "Here is a survey of news articles from the past week about Ex-Blue Jays:";
        for (newsItem of news) {
            newsString += `\n- ${newsItem.shortDate}: ${newsItem.summary}`;
        }
    }

    let transactionsString = "";
    if (transactions) {
        transactionsString += "Here is a list of transactions involving Ex-Blue Jays:";
        for (transaction of transactions) {
            transactionsString += `\n- ${transaction.shortDate}: (${transaction.typeDesc}) ${transaction.description}`;
        }
    }


    let prompt = `Your name is Mister Ex and you are an old timey sports reporter whose beat is former Toronto Blue Jays.
    
    Here are statistics for some former ex-Blue Jays for the last week.  The
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
    
    ${newsString}
    
    ${transactionsString}
    
    Your task is to write a weekly report about the progress of former Toronto Blue Jays baseball players.
    
    - In three to five sentences, summarize the outstanding performances from the past week.  
    - In a sentence or two, mention the better hitters and pitchers of the season so far.
        - Be careful to interpret the tables accurately in identifying the outstanding performances.
    - If there are any interesting news stories, include them in your report.
    - Mention significant transactions involving ex-Blue Jays.
        - Trades and free agent signings are obviously important.
        - Long term injuries and activations from long-term injuries might be worth mentioning if they involve important players.
        - Transactions involving non-MLB clubs are probably not important
        - If a player was traded or released BY the Blue Jays, mention their becoming an Ex-Blue Jay
    - In a final sentence, mention the Blue Jays' opponents for the next week and any former teammates they might face in those series. 
        - If you've already noted a player was just traded or released by their team, do not include them as possible Blue Jays opponent.
    - PLEASE USE THE STYLE OF A 1940s SPORTS REPORT.
    
    Please observe these suggestions for your report
    - Do not use markdown formatting in your report.  Use plain text and normal punctuation.
    - Introduce yourself at the beginning but do not actually use the word old-timey.
    - Use past tense to describe the past week.
    - Emphasize players with a higher number of career games played as a Blue Jay (gamesWithJays) 
      and seasons with the Jays (the list yearsWithJays) but do not pedantically list those numbers.
    - Be careful not to invent statistics or misread the tables.
    - Do not mix up weekly and year-to-date statistics.
    - Do not impute details not mentioned in news stories.
    - Occasionally work in the year the players last played for Toronto and how they are fondly remembered.
    - Please do not accidentally say any of the players are still with the Blue Jays.
    - Don't call players rookies unless you know they are first-year players (unlikely).
    - Try not to mention the same detail twice if it is in one or more news article and a transaction wire item.
    - NEVER USE THE WORD PINSTRIPES.  ONLY THE YANKEES WEAR PINSTRIPES!!!!
    
    `;

    return prompt;
}


async function rateNews(content, playerName) {
    // evaluate the submitted news
    let prompt = `Consider the news article text below.
    
    ------------------
    
    ${content}
    
    ------------------
      
    Please assess whether or not it is newsworthy information about player ${playerName}.
    
    Categorize the information as one of the following:
    
    - GREAT GAME
    - AWARD
    - INJURY
    - CAREER
    - NON-BASEBALL
    - OTHER
    
    Please rate the newsworthiness on a scale of 0 to 10 using the EXAMPLES below as a reference:
    
    - ${playerName} hit a home run and had multiple RBI (rating 7 / GREAT GAME)
    - ${playerName} had a quality start (rating 6 / GREAT GAME)
    - ${playerName} had the game-winning hit (rating 5 / GREAT GAME)
    - ${playerName} had a notable performance in a game (rating 4 / GREAT GAME)
    - ${playerName} went on or came of the injured list (rating 5 / INJURY)
    - ${playerName} won an award such as player of the week or player of the month (rating 8 / AWARD)
    - ${playerName} was named to all-star team (rating 8 / AWARD)
    - ${playerName} won an end-of-season award (rating 10 / AWARD)
    - ${playerName} announced his retirement (rating 10 / CAREER)
    - ${playerName} was traded or signed as a free agent with a new team (rating 8 / CAREER)
    - ${playerName} was released by his team (rating 6 / CAREER)
    - ${playerName} was hired in a coaching or managerial role (rating 8 / NON-BASEBALL)
    - ${playerName} was mentioned in a game summary but not in a starring role (rating 2 / GREAT GAME)
    - ${playerName} discussing personal experiences or struggles (rating 2 / NON-BASEBALL)
    - ${playerName} not mentioned by name (rating 0 / OTHER)
    - ${playerName} was mentioned in a rumoured or speculated trade (rating 1 / CAREER)
    
    DO NOT BE LIBERAL WITH RATINGS OF 5 OR HIGHER.  Save them for truly noteworthy news ABOUT ${playerName}.
    
    BE CAREFUL NOT TO CONFUSE PLAYERS WITH THE SAME FIRST NAME OR SAME LAST NAME.  Only consider news about ${playerName}.
    
    Give a short explanation for your newsworthiness rating.
    
    Finally, please summarize the information in the article pertaining to ${playerName} in one or two detailed sentences.
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

    return await askCerebras(prompt, response_format, "low");
}


module.exports = { askCerebras, buildPrompt, rateNews };
