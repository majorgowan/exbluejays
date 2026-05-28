## The Ex-Blue Jays Report

The resource for keeping tabs on former members of your Toronto Blue Jays.

- automatically updates player stats and team affiliation
- collects news about former players
- generates a weekly rundown on all things ex-Blue Jays related
- composes and sends weekly newsletter to subscribers

#### Tools and services used

- `Node.js` with `express.js` web server framework
- `MongoDB` for database back-end
- `EJS` for html templating
- `email-templates` for generating html newsletter
- `fast-fuzzy` for deduplicating news articles
- [`Mailgun`](https://www.mailgun.com/) for sending e-mails
- [`Cerebras`](https://cloud.cerebras.ai/) for generative AI
- [`Tavily`](https://www.tavily.com/) for news crawling
- [`MLB Advanced Media`](https://statsapi.mlb.com/) for Major League Baseball stats

#### Deployment

- Requires API keys configured in `.env` file for `Mailgun`, `Cerebras` and `Tavily`.


Deployed at https://exbluejays.ca

###### by Mark Fruman `mark.fruman@yahoo.com`
