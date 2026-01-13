# Browserbase Proxy Testing Script - See README.md for full documentation

import asyncio
import json
import os

from browserbase import Browserbase
from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

bb = Browserbase(api_key=os.environ.get("BROWSERBASE_API_KEY"))


async def create_session_with_built_in_proxies():
    session = await asyncio.to_thread(
        bb.sessions.create,
        project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
        proxies=True,
    )
    return session


async def create_session_with_geo_location():
    session = await asyncio.to_thread(
        bb.sessions.create,
        project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
        proxies=[
            {
                "type": "browserbase",
                "geolocation": {
                    "city": "NEW_YORK",
                    "state": "NY",
                    "country": "US",
                },
            }
        ],
    )
    return session


async def test_session(session_function, session_name: str):
    print(f"\n=== Testing {session_name} ===")

    bb_session = await session_function()
    print(f"Browserbase Session URL: https://browserbase.com/sessions/{bb_session.id}")

    # Use the v3 SDK to create a Stagehand session that connects to the existing Browserbase session
    # Note: In v3, we'd need to pass the session_id to connect to an existing session
    # For now, we'll create a new session and navigate to the IP info page
    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print(f"Stagehand Session: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        await session.navigate(url="https://ipinfo.io/json")

        geo_info = await session.extract(
            instruction="Extract all IP information and geolocation data from the JSON response",
            schema={
                "type": "object",
                "properties": {
                    "ip": {"type": "string", "description": "The IP address"},
                    "city": {"type": "string", "description": "The city name"},
                    "region": {"type": "string", "description": "The state or region"},
                    "country": {"type": "string", "description": "The country code"},
                    "loc": {"type": "string", "description": "The latitude and longitude coordinates"},
                    "timezone": {"type": "string", "description": "The timezone"},
                    "org": {"type": "string", "description": "The organization or ISP"},
                    "postal": {"type": "string", "description": "The postal code"},
                },
                "required": ["ip", "city", "country"],
            },
        )

        print("Geo Info:", json.dumps(geo_info.data.result, indent=2))
        print(f"{session_name} test completed")

    finally:
        await session.end()


async def main():
    await test_session(create_session_with_built_in_proxies, "Built-in Proxies")
    await test_session(create_session_with_geo_location, "Geolocation Proxies (New York)")
    print("\n=== All tests completed ===")


if __name__ == "__main__":
    asyncio.run(main())
