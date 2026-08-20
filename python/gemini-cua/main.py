"""Run a Gemini browser-research agent with Deep Agents and Stagehand V4 code mode."""

from __future__ import annotations

import asyncio

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
    target_url = "https://docs.stagehand.dev/v4/first-steps/introduction"
    instruction = (
        f"Open {target_url}, explain in one sentence what Stagehand is, and cite the exact URL "
        "you opened."
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
                + "\nUse no more than four browser-tool calls. Prefer deterministic browser APIs "
                "and return the cited summary as soon as you have read the target page."
            ),
        )
        answer = ""
        for attempt in range(2):
            prompt = (
                instruction
                if attempt == 0
                else (
                    "Use the browser's current page to finish the requested one-sentence "
                    f"summary and cite {target_url}."
                )
            )
            result = await agent.ainvoke(
                {"messages": [{"role": "user", "content": prompt}]},
                config={"recursion_limit": 20},
            )
            answer = message_text(result["messages"][-1]).strip()
            if target_url in answer:
                break
            print("Agent returned no cited summary; retrying once in the same browser session.")

    if not answer or target_url not in answer:
        raise RuntimeError("Agent did not return a summary with the opened Stagehand docs URL")

    print(answer)
    print("Stagehand code-mode session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"Error in Gemini browser agent example: {error}")
        print("Check BROWSERBASE_API_KEY and AI_GATEWAY_API_KEY in .env")
        raise SystemExit(1) from error
