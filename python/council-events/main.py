# Stagehand + Browserbase: Philadelphia Council Events Scraper - See README.md for full documentation

import asyncio
import json
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()


async def main():
    print("Starting Philadelphia Council Events automation...")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print("Initializing browser session...")
    print("Stagehand session started successfully")
    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to: https://phila.legistar.com/")
        await session.navigate(url="https://phila.legistar.com/")
        print("Page loaded successfully")

        print("Clicking calendar from the navigation menu")
        await session.act(input="click calendar from the navigation menu")

        print("Selecting 2025 from the month dropdown")
        await session.act(input="select 2025 from the month dropdown")

        print("Extracting event information...")
        results = await session.extract(
            instruction="Extract the table with the name, date and time of the events",
            schema={
                "type": "object",
                "properties": {
                    "results": {
                        "type": "array",
                        "description": "array of events",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {
                                    "type": "string",
                                    "description": "the name of the event",
                                },
                                "date": {
                                    "type": "string",
                                    "description": "the date of the event",
                                },
                                "time": {
                                    "type": "string",
                                    "description": "the time of the event",
                                },
                            },
                            "required": ["name", "date", "time"],
                        },
                    }
                },
                "required": ["results"],
            },
        )

        extracted = results.data.result
        event_count = len(extracted.get("results", [])) if isinstance(extracted, dict) else 0
        print(f"Found {event_count} events")
        print("Event data extracted successfully:")
        print(json.dumps(extracted, indent=2))

    finally:
        await session.end()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Application error: {err}")
        print("\nCommon issues:")
        print("1. Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("2. Verify MODEL_API_KEY is set in environment")
        print("3. Ensure https://phila.legistar.com is accessible")
        exit(1)
