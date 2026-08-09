# Browser Workflow Demo: Search, Fetch & Stagehand V4 on Browserbase

## AT A GLANCE

- **Goal**: search the web, fetch page content, and extract structured information — all through one Browserbase API key.
- **Pattern**: Search → Fetch → Stagehand Extract. Lightweight primitives gather context before opening a browser for model-backed extraction.
- **Single API key**: the Model Gateway routes LLM requests through Browserbase — no separate OpenAI/Anthropic/Google keys needed.
- **Full platform demo**: uses Browsers, Search API, Fetch API, Stagehand, and Model Gateway together.
  Docs → https://docs.browserbase.com

## GLOSSARY

- **Search API**: search the web for structured results (titles, URLs, metadata) without a browser session.
  Docs → https://docs.browserbase.com/features/search
- **Fetch API**: fetch page content (HTML, status, headers) for token-efficient context — no browser needed.
  Docs → https://docs.browserbase.com/features/fetch
- **Stagehand**: the SDK for browser agents, with deterministic browser APIs and model-backed act, extract, and observe primitives.
  Docs → https://docs.stagehand.dev
- **extract()**: model-backed structured data extraction with a Zod V4 schema.
  Docs → https://docs.stagehand.dev/v4/basics/extract
- **Model Gateway**: routes LLM requests through Browserbase with unified billing across OpenAI, Anthropic, and Google.
  Docs → https://docs.browserbase.com/features/model-gateway
- **Agent Identity**: built-in credential management and strategic partnerships for accessing any website.
  Docs → https://docs.browserbase.com/features/agent-identity

## QUICKSTART

1. cd typescript/browser-agent-demo
2. pnpm install
3. cp .env.example .env
4. Add BROWSERBASE_API_KEY to .env (get it from https://browserbase.com/settings)
5. pnpm start

## EXPECTED OUTPUT

- Searches the web for "best coffee shops in San Francisco" and displays 5 structured results
- Selects the top result and fetches its HTML content with status code, content type, and preview
- Launches a Stagehand V4 browser on Browserbase
- Navigates to the selected page and extracts the top 3 recommendations
- Outputs structured findings and closes both lifecycle handles

## COMMON PITFALLS

- Missing API key: verify .env contains BROWSERBASE_API_KEY — this is the only required credential
- No separate LLM keys needed: the Model Gateway handles model access through your Browserbase key
- Search returns no results: try a different query string — some queries may return empty depending on availability
- Session not closing: the demo uses `try/finally` to close both Stagehand and the browser handle
- Find more information on your Browserbase dashboard -> https://www.browserbase.com/sign-in

## USE CASES

• Building research agents that search, evaluate, and extract from web pages
• Token-efficient web browsing pipelines (cheap Search/Fetch before expensive browser sessions)
• Model-backed data extraction from pages without writing selectors
• Prototyping browser agents with the full Browserbase platform

## NEXT STEPS

• **Customize the query**: change the search query and extraction instruction
• **Add multi-page navigation**: use browser pages and ordinary application control flow
• **Deploy as a Function**: run the agent on Browserbase infrastructure with <5ms browser latency
Docs → https://docs.browserbase.com/features/functions
• **Enable stealth mode**: add `browserSettings: { advancedStealth: true, solveCaptchas: true }` for protected sites
• **Switch models**: change `model.modelName` in `Stagehand.create()` or omit it for automatic routing

## HELPFUL RESOURCES

📚 Browserbase Docs: https://docs.browserbase.com
📚 Stagehand Docs: https://docs.stagehand.dev
📚 Search API: https://docs.browserbase.com/features/search
📚 Fetch API: https://docs.browserbase.com/features/fetch
📚 Implementation Docs: https://docs.browserbase.com/features/fetch
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
