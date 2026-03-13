# Stagehand + Browserbase: LinkedIn Banner Image Scraper

## AT A GLANCE

- Goal: Given a company name, find its LinkedIn page via Google and extract a screenshot of its banner image.
- Uses a Stagehand CUA agent to autonomously search Google and navigate to the correct LinkedIn result.
- Falls back to `stagehand.extract` to locate the banner image URL, then screenshots it with pixel-perfect clipping.
- Runs with advanced stealth and proxies enabled for reliable LinkedIn access.
  Docs → https://docs.stagehand.dev/basics/agent

## GLOSSARY

- agent: create an autonomous AI agent that can execute complex multi-step tasks
  Docs → https://docs.stagehand.dev/basics/agent#what-is-agent
- extract: extract structured data from a page using natural language and a Zod schema
  Docs → https://docs.stagehand.dev/basics/extract
- advancedStealth: Browserbase browser hardening to reduce bot detection
  Docs → https://docs.browserbase.com/features/stealth-mode
- proxies: Browserbase's default proxy rotation for enhanced privacy
  Docs → https://docs.browserbase.com/features/proxies

## QUICKSTART

1.  cd typescript/agent-screenshot
2.  npm install
3.  cp .env.example .env
4.  Add your BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, and GOOGLE_GENERATIVE_AI_API_KEY to .env
5.  npm start -- "Company Name"

## EXPECTED OUTPUT

- Initializes a Stagehand session on Browserbase with advanced stealth and proxies
- Navigates to Google and uses a CUA agent to search for the company's LinkedIn page
- Clicks the most likely LinkedIn result and waits for the page to fully load
- Extracts the banner image URL using `stagehand.extract`
- Navigates to the image URL and takes a clipped screenshot focused on the image
- Saves the screenshot to `images/{company}-banner.png`

## COMMON PITFALLS

- Missing company name argument: run as `npm start -- "Company Name"`
- Missing credentials: verify .env contains `BROWSERBASE_PROJECT_ID`, `BROWSERBASE_API_KEY`, and `GOOGLE_GENERATIVE_AI_API_KEY`
- Proxies require Browserbase Developer plan or higher
- LinkedIn popups: the agent will attempt to dismiss login modals automatically
- No banner image found: some LinkedIn pages may not have a banner image set
- `"Extraction incomplete after processing all data"`: this is a misleading Stagehand log, not an error — if the screenshot was saved, the extraction succeeded

## USE CASES

• Brand research: Quickly capture LinkedIn banner images for competitor or partner company profiles.
• Design audits: Collect and compare banner visuals across a list of companies at scale.
• Lead enrichment: Automate LinkedIn profile scraping as part of a larger data pipeline.

## NEXT STEPS

• Loop over a list: Pass multiple company names and save each banner to a uniquely named file.
• Add retry logic: Implement fallback strategies if the agent lands on the wrong page.
• Extend extraction: Pull additional data like company description, follower count, or employee headcount alongside the banner.

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev/v3/first-steps/introduction
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
