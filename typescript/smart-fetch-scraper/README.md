# Stagehand + Browserbase: Smart Fetch Scraper

## AT A GLANCE

- Goal: scrape a webpage using the fastest method available — Fetch API first, full browser session as fallback.
- Fetch API fast-path: sends a lightweight HTTP request via `POST /v1/fetch` — no browser session, no AI credits. Returns raw HTML in milliseconds.
- Browser fallback: when the Fetch API returns insufficient content (JS-rendered pages), automatically falls back to a Stagehand browser session with AI-powered `extract()`.
- Model: uses `google/gemini-2.5-flash` for the browser fallback path.
  Docs -> https://docs.stagehand.dev

## GLOSSARY

- Fetch API: Browserbase's lightweight HTTP fetching endpoint — fetches page content through Browserbase infrastructure without spinning up a browser
  Endpoint -> `POST https://api.browserbase.com/v1/fetch`
- extract: pull structured data from pages using schemas and AI
  Docs -> https://docs.stagehand.dev/basics/extract
- Stagehand: AI browser automation framework
  Docs -> https://docs.stagehand.dev

## QUICKSTART

1. cd typescript/smart-fetch-scraper
2. npm install
3. cp .env.example .env (or create .env with required keys)
4. Add BROWSERBASE_PROJECT_ID, BROWSERBASE_API_KEY, and GOOGLE_API_KEY to .env
5. npm start <url>

Example: `npm start https://news.ycombinator.com`

## HOW IT WORKS

1. **Fetch API attempt** — Sends a `POST /v1/fetch` request with the target URL. This is a simple HTTP proxy through Browserbase infrastructure. No browser boots up, no AI is invoked. Fast and cheap.
2. **Content check** — Inspects the response length. If the HTML is above the threshold (`MIN_CONTENT_LENGTH`), the content is likely server-rendered and usable as-is.
3. **Browser fallback** — If the Fetch API returns too little content (common for SPAs, JS-heavy sites), a full Stagehand browser session is started. The page is rendered in a real browser, and `extract()` pulls structured data using a Zod schema.

## EXPECTED OUTPUT

- Logs the strategy being used (Fetch API vs browser)
- On Fetch API success: prints page title, link count, status code, content preview
- On browser fallback: prints Stagehand live view link, then structured JSON with page title and extracted items

## WHEN TO USE WHICH

| Scenario | Best approach |
|---|---|
| Static HTML pages (blogs, docs, news) | Fetch API |
| Server-rendered content (HN, Wikipedia) | Fetch API |
| SPAs, React/Vue/Angular apps | Browser fallback |
| Pages behind Cloudflare/anti-bot | Browser fallback |
| Pages requiring interaction (login, scroll) | Browser fallback |

## COMMON PITFALLS

- Missing credentials: verify .env contains BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY
- Fetch API access: the Fetch API may require enablement on your account — contact support if you get a 404
- Google API access: GOOGLE_API_KEY is only needed for the browser fallback path
- Content threshold: adjust MIN_CONTENT_LENGTH if server-rendered pages are incorrectly triggering the browser fallback
- Text density: adjust MIN_TEXT_DENSITY if pages with lots of inline scripts/styles are incorrectly triggering the browser fallback
- JS-challenge detection: JS_REQUIRED_PATTERNS covers common bot-detection pages (Cloudflare, etc.) — extend the array for other patterns you encounter
- Timeout: the Fetch API has a 10-second timeout and 1MB max response — very large or slow pages will need the browser path

## USE CASES

- Cost-optimized scraping: Use the Fetch API for the majority of pages and only spend browser session credits on JS-heavy ones.
- Speed-sensitive pipelines: Get sub-second responses for static pages without waiting for a browser to boot.
- Hybrid data extraction: Quick HTML parsing for simple pages, AI-powered structured extraction for complex ones.
- Monitoring and alerting: Cheaply poll pages for content changes, escalate to browser only when needed.

## NEXT STEPS

- Add a proper HTML parser (e.g., cheerio) for richer Fetch API-side extraction without AI.
- Batch multiple URLs and fan out Fetch API calls concurrently (up to your concurrency limit).
- Add caching: hash Fetch API responses to detect changes before running expensive browser extractions.
- Integrate with your pipeline: use the Fetch API for initial triage, browser sessions for deep extraction.

## HELPFUL RESOURCES

Stagehand Docs: https://docs.stagehand.dev
Browserbase: https://www.browserbase.com
Try it out: https://www.browserbase.com/playground
Templates: https://www.browserbase.com/templates
Need help? support@browserbase.com
Discord: http://stagehand.dev/discord
