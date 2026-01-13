# Stagehand + Browserbase: Computer Use Agent (CUA) Example - See README.md for full documentation

import asyncio
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

# Load environment variables
load_dotenv()

# ============================================================================
# EXAMPLE INSTRUCTIONS - Choose one to test different scenarios
# ============================================================================

# Example 1: Learning Plan Creation
# instruction = """I want to learn more about Sourdough Bread Making. It's my first time learning about it, and want to get a good grasp by investing 1 hour a day for the next 2 months. Go find online courses/resources, create a plan cross-referencing the time I want to invest with the modules/timelines of the courses and return the plan"""

# Example 2: Flight Search
# instruction = """Use flights.google.com to find the lowest fare from all eligible one-way flights for 1 adult from JFK to Heathrow in the next 30 days."""

# Example 3: Solar Eclipse Research
instruction = """Search for the next visible solar eclipse in North America and its expected date, and what about the one after that."""

# Example 4: GitHub PR Verification
# instruction = """Find the most recently opened non-draft PR on Github for Browserbase's Stagehand project and make sure the combination-evals in the PR validation passed."""

# ============================================================================


async def main():
    print("Starting Computer Use Agent Example...")

    # Initialize Stagehand with Browserbase for cloud-based browser automation.
    # Environment variables used: BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, MODEL_API_KEY
    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-pro")

    print("Stagehand initialized successfully!")
    print(f"Session ID: {session.id}")
    print(f"Live View Link: https://browserbase.com/sessions/{session.id}")

    try:
        # Navigate to search engine for the CUA agent to start from
        print("Navigating to Google search...")
        await session.navigate(url="https://www.google.com/")

        # Execute the autonomous task with the Computer Use Agent.
        # The agent will take multiple steps to complete complex tasks.
        print("Executing instruction with CUA agent:", instruction)
        result = await session.execute(
            execute_options={
                "instruction": instruction,
                "max_steps": 30,  # Maximum number of steps the agent can take
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
        print("Docs: https://docs.stagehand.dev/v3/first-steps/introduction")
        exit(1)
