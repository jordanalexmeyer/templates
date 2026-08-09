# Stagehand V4 + Browserbase: Research Workflow

## AT A GLANCE

- Goal: demonstrate the Stagehand V4 replacement for the former computer-use-agent example.
- Uses explicit browser navigation and `extract()` through Browserbase Model Gateway.
- Stagehand V4 intentionally has no `agent()` or CUA orchestration API; application code owns the steps.

## QUICKSTART

1. `pnpm install`
2. `cp .env.example .env`
3. Add `BROWSERBASE_API_KEY` to `.env`
4. `pnpm start`

## EXPECTED OUTPUT

- Launches a Browserbase browser with `browserbase.launch()`
- Creates Stagehand with `Stagehand.create({ browser })`
- Opens search results for the configured question
- Extracts and prints an answer from the visible results
- Closes both Stagehand and the browser handle

## COMMON PITFALLS

- Missing credentials: verify `.env` contains `BROWSERBASE_API_KEY`
- V4 primitives return `{ data, metadata }`; read the answer from `result.data`
- For autonomous runtime orchestration, expose V4 browser methods to your agent framework as tools

## HELPFUL RESOURCES

📚 Stagehand V4 Migration: https://docs.stagehand.dev/v4/migrations/v3
📚 Stagehand V4 Docs: https://docs.stagehand.dev/v4/first-steps/introduction
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
💬 Discord: http://stagehand.dev/discord
