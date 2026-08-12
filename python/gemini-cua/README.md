# Gemini browser agent with Stagehand V4

Stagehand is the SDK for browser agents.

This template pairs a bring-your-own Gemini model with LangChain Deep Agents and Stagehand V4 code
mode. The agent researches the next two solar eclipses visible in North America and cites only
sources it opened in the browser.

## How it works

- `create_deep_agent` owns the Gemini reasoning and tool loop.
- Stagehand code mode exposes one persistent Browserbase session through `run`, `snapshot`, and
  `screenshot` MCP tools.
- Vercel AI Gateway provides the Gemini model through its OpenAI-compatible endpoint.
- Runtime validation requires two future years and at least two opened source URLs.
- Closing the MCP session shuts down the Stagehand client and Browserbase browser.

## Quickstart

Requirements: Python 3.11–3.13 and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env
# Add BROWSERBASE_API_KEY and AI_GATEWAY_API_KEY to .env.
uv sync
uv run python main.py
```

The first run installs the Stagehand Deep Agents integration from `stagehand/main` in `uvx`; the
integration pins its Stagehand server dependency to `stagehand==4.0.0`.

## Expected outcome

The agent returns the dates of the next two relevant eclipses with at least two live source URLs it
opened directly. The script exits nonzero when the answer is empty, lacks two future years, or does
not include enough source evidence.

## Configuration

- `BROWSERBASE_API_KEY`: launches the Browserbase session.
- `AI_GATEWAY_API_KEY`: authenticates Gemini through Vercel AI Gateway.
- `DEEPAGENTS_MODEL`: optional model override; defaults to `google/gemini-3-flash-preview`.
- `STAGEHAND_RUN_TIMEOUT_MS`: optional browser-tool timeout; defaults to 120 seconds.

## Resources

- [Stagehand V4 documentation](https://docs.stagehand.dev/v4)
- [Stagehand Deep Agents integration](https://github.com/browserbase/stagehand/tree/main/packages/integrations/deepagents)
- [Vercel AI Gateway Python integration](https://vercel.com/docs/ai-gateway/sdks-and-apis/python)
