# Stagehand V4 + Browserbase: Gemini Research Workflow

## AT A GLANCE

- Goal: demonstrate a Stagehand V4 research flow using explicit browser navigation and structured extraction.
- Uses Browserbase Model Gateway with `google/gemini-3-flash-preview`.
- Stagehand V4 intentionally has no `agent()` API; application code owns the multi-step workflow.

## QUICKSTART

1. `pnpm install`
2. `cp .env.example .env`
3. Add `BROWSERBASE_API_KEY` to `.env`
4. `pnpm start`

## EXPECTED OUTPUT

- Launches a Browserbase browser with `browserbase.launch()`
- Creates Stagehand with `Stagehand.create({ browser })`
- Opens Google results for the configured research question
- Extracts an answer from the visible results
- Closes both Stagehand and the browser handle

## COMMON PITFALLS

- Missing credentials: verify `.env` contains `BROWSERBASE_API_KEY`
- A local browser cannot use Browserbase Model Gateway; configure a model explicitly for local runs
- V4 primitives return `{ data, metadata }`; read the answer from `result.data`

## HELPFUL RESOURCES

📚 Stagehand V4 Docs: https://docs.stagehand.dev/v4/first-steps/introduction
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
💬 Discord: http://stagehand.dev/discord
