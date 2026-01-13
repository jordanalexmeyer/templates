# Stagehand + Browserbase: Polymarket prediction market research - See README.md for full documentation

import asyncio
import json
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

# Load environment variables
load_dotenv()


async def main():
    """
    Searches Polymarket for a prediction market and extracts current odds, pricing, and volume data.
    Uses AI-powered browser automation to navigate and interact with the site.
    """
    print("Starting Polymarket research automation...")

    # Initialize Stagehand with Browserbase for cloud-based browser automation.
    # Environment variables used: BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, MODEL_API_KEY
    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print("Initializing browser session...")
    print("Stagehand session started successfully")
    # Provide live session URL for debugging and monitoring
    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to: https://polymarket.com/")
        await session.navigate(url="https://polymarket.com/")
        print("Page loaded successfully")

        # Click the search box to trigger search dropdown
        print("Clicking the search box at the top of the page")
        await session.act(input="click the search box at the top of the page")

        # Type search query
        searchQuery = "Elon Musk unfollow Trump"
        print(f"Typing '{searchQuery}' into the search box")
        await session.act(input=f"type '{searchQuery}' into the search box")

        print("Selecting first market result from search dropdown")
        await session.act(input="click the first market result from the search dropdown")
        print("Market page loaded")

        print("Extracting market information...")
        marketData = await session.extract(
            instruction="Extract the current odds and market information for the prediction market",
            schema={
                "type": "object",
                "properties": {
                    "marketTitle": {
                        "type": "string",
                        "description": "the title of the market",
                    },
                    "currentOdds": {
                        "type": "string",
                        "description": "the current odds or probability",
                    },
                    "yesPrice": {"type": "string", "description": "the yes price"},
                    "noPrice": {"type": "string", "description": "the no price"},
                    "totalVolume": {
                        "type": "string",
                        "description": "the total trading volume",
                    },
                    "priceChange": {
                        "type": "string",
                        "description": "the recent price change",
                    },
                },
            },
        )

        print("Market data extracted successfully:")
        print(json.dumps(marketData.data.result, indent=2))

    finally:
        await session.end()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error in polymarket research: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Verify MODEL_API_KEY is set in environment")
        print("  - Ensure https://polymarket.com is accessible")
        exit(1)
