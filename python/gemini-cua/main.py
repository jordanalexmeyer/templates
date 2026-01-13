# Stagehand + Browserbase: Computer Use Agent (CUA) Example - See README.md for full documentation

import asyncio
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

# Example instruction - search for solar eclipse information
instruction = """Search for the next visible solar eclipse in North America and its expected date, and what about the one after that."""


async def main():
    print("Starting Computer Use Agent Example...")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-pro")

    print("Stagehand initialized successfully!")
    print(f"Session ID: {session.id}")
    print(f"Live View Link: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to Google search...")
        await session.navigate(url="https://www.google.com/")

        print("Executing instruction with CUA agent:", instruction)
        result = await session.execute(
            execute_options={
                "instruction": instruction,
                "max_steps": 30,
            },
            agent_config={
                "model": "google/gemini-2.5-computer-use-preview-10-2025",
            },
            timeout=300.0,
        )

        if hasattr(result.data, "success") and result.data.success:
            print("Task completed successfully!")
        elif hasattr(result.data, "result"):
            print("Task completed!")
        else:
            print("Task execution finished")
        print("Result:", result.data)

    finally:
        await session.end()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error in computer use agent example: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Verify MODEL_API_KEY is set for the agent")
        exit(1)
