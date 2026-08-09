# Stagehand + Browserbase + Exa: Intelligent Job Application Automation

## AT A GLANCE

- **Goal**: Automate job applications with AI that writes smart, tailored responses for each role.
- **Pattern Template**: combines Exa search, a Vercel AI SDK agent, and Stagehand code mode.
- **Workflow**: Exa finds careers pages, then one bring-your-own agent per company uses `code_execute` to inspect and fill an application.
- **Plans**: Sequential mode works on all plans; concurrent applications and proxies require Startup or Developer plan or higher ([concurrency](https://docs.browserbase.com/guides/concurrency-rate-limits), [proxies](https://docs.browserbase.com/features/proxies)).
- Docs → [Vercel AI SDK Agents](https://ai-sdk.dev/docs/agents/building-agents) | [Exa Search](https://docs.exa.ai/reference/search) | [Stagehand](https://docs.stagehand.dev)

## THE 5-STEP FLOW

1. **Search for companies** — Exa finds companies matching your criteria (e.g., "AI startups in SF")
2. **Find careers pages** — For each company, Exa searches for their careers/jobs page
3. **Start a browser agent** — Vercel AI SDK owns the loop and receives Stagehand's `code_execute` MCP tool
4. **Inspect and fill** — the agent reads the posting and fills known fields with deterministic V4 APIs or Stagehand AI primitives
5. **Stop for review** — the agent uploads the resume but stops before final submission

## GLOSSARY

- **ToolLoopAgent**: the Vercel AI SDK loop that reasons and selects tools.
  Docs → https://ai-sdk.dev/docs/agents/building-agents
- **code_execute**: Stagehand code mode's stateful MCP tool for browser JavaScript, V4 page APIs, locators, and AI primitives.
- **Exa Search**: AI search engine that finds relevant web content. Can search for companies, find similar pages, and filter by date.
  Docs → https://docs.exa.ai/reference/search
- **Tailored responses**: The AI reads the job requirements and writes custom answers for cover letters and open-ended questions that highlight relevant skills.

## QUICKSTART

1. cd exa-browserbase
2. pnpm install
3. cp .env.example .env
4. Add required API keys to .env:
   - `BROWSERBASE_API_KEY` — from Browserbase
   - `AI_GATEWAY_API_KEY` — from Vercel AI Gateway
   - `EXA_API_KEY` — from https://dashboard.exa.ai/api-keys
5. Update `applicationDetails` object with candidate information
6. Update `resumePath` to point to your PDF resume
7. pnpm start

## EXPECTED OUTPUT

- Uses your exact info for name, email, phone
- Writes custom answers for open-ended questions
- Creates a tailored cover letter based on the job
- Handles location and visa questions smartly
- Stops before submitting (for testing/review purposes)
- Closes every MCP client, Stagehand instance, and browser cleanly

## SAFETY

Code mode executes model-authored JavaScript and is not itself a security sandbox. Isolate it when prompts or pages are untrusted. Keep the stop-before-submit instruction when adapting this example.

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev/v4/first-steps/introduction
📚 Vercel AI SDK MCP Tools: https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools
📚 Exa API Key: https://dashboard.exa.ai/api-keys
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
