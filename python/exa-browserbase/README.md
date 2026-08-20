# Stagehand + Browserbase + Exa: Intelligent Job Application Automation

Stagehand is the SDK for browser agents.

## AT A GLANCE

- **Goal**: Automate job applications with AI that writes smart, tailored responses for each role.
- **Pattern Template**: Combines Exa search, a Deep Agents planning loop, and Stagehand V4 code-mode browser tools.
- **Workflow**: Exa finds companies and careers pages. A Deep Agents agent then controls one Browserbase session through Stagehand's `snapshot`, `run`, and `screenshot` tools, fills the application with tailored answers, and stops before submission for human review.
- **Plans**: Sequential mode works on all plans; concurrent applications and proxies require Startup or Developer plan or higher ([concurrency](https://docs.browserbase.com/guides/concurrency-rate-limits), [proxies](https://docs.browserbase.com/features/proxies)).
- Docs → [Stagehand V4](https://docs.stagehand.dev/v4/first-steps/introduction) | [Exa Search](https://docs.exa.ai/reference/search)

## THE 5-STEP FLOW

1. **Search for companies** — Exa finds companies matching your criteria (e.g., "AI startups in SF")
2. **Find careers pages** — For each company, Exa searches for their careers/jobs page
3. **Inspect the application** — Stagehand's code-mode snapshot exposes the live page to the agent
4. **Smart form filling** — Deep Agents uses Stagehand snapshots and hydrated actions for semantic interaction, reserving run code for exact mechanics and verification
5. **Human review** — The workflow verifies the filled state and intentionally stops before submission

## GLOSSARY

- **Deep Agents**: The bring-your-own agent framework responsible for planning and tool selection. Stagehand V4 does not expose `stagehand.agent()`.
- **Stagehand code mode**: Three browser tools—`snapshot`, `run`, and `screenshot`—served to the agent over MCP.
- **Exa Search**: AI search engine that finds relevant web content. Can search for companies, find similar pages, and filter by date.
  Docs → https://docs.exa.ai/reference/search
- **Tailored responses**: The AI reads the job requirements and writes custom answers for cover letters and open-ended questions that highlight relevant skills.

## QUICKSTART

1. cd exa-browserbase
2. uv sync
3. cp .env.example .env
4. Add required API keys to .env:
   - `BROWSERBASE_API_KEY` — from Browserbase
   - `EXA_API_KEY` — from https://dashboard.exa.ai/api-keys
   - `AI_GATEWAY_API_KEY` — for the Deep Agents model
5. Update `APPLICATION_DETAILS` dict in main.py with candidate information
6. `uv run python main.py`

## EXPECTED OUTPUT

- Uses your exact info for name, email, phone
- Writes custom answers for open-ended questions
- Creates a tailored cover letter based on the job
- Handles location and visa questions smartly
- Stops before submitting (for testing/review purposes)
- Closes session cleanly

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev/v4/first-steps/introduction
📚 Stagehand Python SDK: https://docs.stagehand.dev/v4/sdk/python
📚 Exa API Key: https://dashboard.exa.ai/api-keys
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
