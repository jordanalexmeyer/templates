# Stagehand V4 + Browserbase: Gemini 3 Flash Research

## AT A GLANCE

- Goal: use Gemini 3 Flash through Browserbase Model Gateway for a Stagehand V4 research flow.
- Application code navigates to search results and `extract()` returns the answer.
- Stagehand V4 intentionally has no `agent()` API; multi-step control flow stays in the application.

## QUICKSTART

1. `pnpm install`
2. `cp .env.example .env`
3. Add `BROWSERBASE_API_KEY` to `.env`
4. `pnpm start`

## EXPECTED OUTPUT

- Launches a Browserbase browser
- Creates Stagehand with `google/gemini-3-flash-preview`
- Opens results for the configured research question
- Prints the extracted answer
- Closes Stagehand and the browser handle

## HELPFUL RESOURCES

📚 Stagehand V4 Docs: https://docs.stagehand.dev/v4/first-steps/introduction
📚 Stagehand Extract: https://docs.stagehand.dev/v4/basics/extract
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
💬 Discord: http://stagehand.dev/discord
