"""Run a Gemini browser-research agent with Deep Agents and Stagehand V4 code mode."""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime

from agent_runtime import (
    BROWSER_INSTRUCTIONS,
    SERVER_NAME,
    create_gateway_model,
    create_stagehand_client,
)
from deepagents import create_deep_agent
from dotenv import load_dotenv
from langchain_mcp_adapters.tools import load_mcp_tools

load_dotenv()


def message_text(message: object) -> str:
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and isinstance(block.get("text"), str)
        )
    return str(content)


async def main() -> None:
    today = datetime.now(UTC).date().isoformat()
    instruction = (
        f"As of {today}, search live sources for the next visible solar eclipse in North America "
        "and its expected date, then the one after that. Cite the source URLs you actually opened."
    )
    print("Executing instruction:", instruction)

    client = create_stagehand_client()
    async with client.session(SERVER_NAME) as session:
        tools = await load_mcp_tools(session)
        agent = create_deep_agent(
            model=create_gateway_model("google/gemini-3-flash-preview"),
            tools=tools,
            system_prompt=(
                BROWSER_INSTRUCTIONS
                + "\nUse no more than ten browser-tool calls. Prefer snapshot-guided interaction, "
                "cross-check at least two reliable sources, and return the evidence-backed answer "
                "as soon as you have two future eclipse dates."
            ),
        )
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": instruction}]},
            config={"recursion_limit": 35},
        )
        answer = message_text(result["messages"][-1]).strip()

    source_urls = {url.rstrip(".,;)") for url in re.findall(r"https?://\S+", answer)}
    current_year = int(today[:4])
    future_years = {
        int(year) for year in re.findall(r"\b20\d{2}\b", answer) if int(year) >= current_year
    }
    if not answer or len(source_urls) < 2 or len(future_years) < 2:
        raise RuntimeError("Agent did not return two future eclipse dates with opened source URLs")

    print(answer)
    print("Stagehand code-mode session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"Error in Gemini browser agent example: {error}")
        print("Check BROWSERBASE_API_KEY and AI_GATEWAY_API_KEY in .env")
        raise SystemExit(1) from error
