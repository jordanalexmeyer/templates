# Quickstart: Puppeteer + Browserbase (TypeScript)

## AT A GLANCE

- Goal: connect to a cloud browser via Puppeteer and Browserbase, navigate to a page, and take a screenshot.
- No AI required: uses Puppeteer and the Browserbase SDK directly — no model API key needed.
- Minimal setup: one script, one API key, instant cloud browser.
  Docs → https://docs.browserbase.com/introduction/puppeteer

## GLOSSARY

- Session: a full cloud browser instance you connect to via WebSocket and control with Puppeteer.
  Docs → https://docs.browserbase.com/introduction/getting-started
- WebSocket: the protocol Puppeteer uses to connect to the remote browser.
  Docs → https://docs.browserbase.com/introduction/puppeteer
- Puppeteer: Node.js browser automation library — `page.goto()`, `page.type()`, `page.click()`, etc.
  Docs → https://pptr.dev/api/puppeteer.page
- Debug URL: a live view of your session in the Browserbase dashboard.
  Docs → https://docs.browserbase.com/features/session-inspector

## QUICKSTART

1. cd typescript/quickstart-puppeteer-js
2. npm install
3. cp .env.example .env
4. Add BROWSERBASE_API_KEY to .env (get it from https://browserbase.com/settings)
5. npm start

## EXPECTED OUTPUT

- Creates a Browserbase cloud browser session
- Connects via WebSocket using Puppeteer
- Navigates to https://www.browserbase.com/
- Prints a live debug URL for the session
- Takes a full-page screenshot
- Closes the browser and prints a session replay link

## COMMON PITFALLS

- Missing API key: verify .env contains BROWSERBASE_API_KEY — this is the only required credential
- Project ID confusion: BROWSERBASE_PROJECT_ID is optional — the API infers it from your API key
- Puppeteer version: use `puppeteer-core` (not `puppeteer`) to avoid downloading unnecessary browser binaries — Browserbase provides the browser
- Puppeteer is Node.js only: there is no maintained Python equivalent — use Playwright or Selenium for Python
- Session not closing: always close the browser to avoid leaked sessions
- Find more information on your Browserbase dashboard → https://www.browserbase.com/sign-in

## USE CASES

- Getting started with Browserbase and Puppeteer
- Migrating existing Puppeteer scripts to the cloud
- Cloud browser automation without managing infrastructure
- Taking screenshots of web pages at scale

## NEXT STEPS

- Add AI extraction: swap in Stagehand for AI-powered `act()`, `extract()`, and `observe()`
- Enable proxies: pass `proxies: true` in `bb.sessions.create()` for residential proxy support
- Enable stealth mode: add `browserSettings: { advancedStealth: true, solveCaptchas: true }` to bypass bot detection
- Run in parallel: create multiple sessions for concurrent browser automation

## HELPFUL RESOURCES

📚 Browserbase Docs: https://docs.browserbase.com
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
