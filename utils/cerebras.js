const Cerebras = require("@cerebras/cerebras_cloud_sdk");

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

        return response.choices[0].message.content;

    } catch (error) {
        if (error instanceof Cerebras.APIError) {
            console.error("API Error: ", error.status, error.name, error.message);
        } else {
            console.error("Unexpected error:", error);
        }
    }
}

function buildPrompt(hitters=null, pitchers=null, notes=null, news=null) {
    // generate the content for asking cerebras
    const prompt = "Show me the money!!!!";
    return prompt
}


module.exports = { askCerebras, buildPrompt };
