# Stagehand + Browserbase: Weather Proxy Demo - See README.md for full documentation

import asyncio
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

# Load environment variables
load_dotenv()


async def get_weather_for_location(geolocation: dict) -> dict:
    """
    Fetches weather data for a specific location using geolocation proxies.
    Each call creates a new session that appears to originate from the specified location.
    """
    city_name = geolocation["city"].replace("_", " ")
    print(f"\n=== Getting weather for {city_name}, {geolocation['country']} ===")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-flash")

    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        print(f"Navigating to weather service for {city_name}...")
        await session.navigate(url="https://www.windy.com/")
        print(f"Page loaded for {city_name}")

        await asyncio.sleep(2)

        print(f"Extracting temperature data for {city_name}...")
        extract_result = await session.extract(
            instruction="Extract the current temperature and its unit",
            schema={
                "type": "object",
                "properties": {
                    "temperature": {"type": "number", "description": "The current temperature value"},
                    "unit": {"type": "string", "description": "The temperature unit"},
                },
                "required": ["temperature", "unit"],
            },
        )

        result = extract_result.data.result
        print(f"Successfully extracted weather data for {city_name}: {result.get('temperature')} {result.get('unit')}")

        return {
            "city": city_name,
            "country": geolocation["country"],
            "temperature": result.get("temperature", 0.0),
            "unit": result.get("unit", ""),
            "error": None,
        }

    except Exception as error:
        print(f"Error getting weather for {city_name}: {error}")
        return {
            "city": city_name,
            "country": geolocation["country"],
            "temperature": 0.0,
            "unit": "",
            "error": str(error),
        }

    finally:
        await session.end()


def display_results(results: list):
    print("\n=== Weather Results ===")
    for result in results:
        if result.get("error"):
            print(f"{result['city']}, {result['country']}: Error - {result['error']}")
        else:
            print(f"{result['city']}, {result['country']}: {result['temperature']} {result['unit']}")


async def main():
    locations = [
        {"city": "NEW_YORK", "state": "NY", "country": "US"},
        {"city": "LONDON", "country": "GB"},
        {"city": "TOKYO", "country": "JP"},
        {"city": "SAO_PAULO", "country": "BR"},
    ]

    print("=== Weather Proxy Demo - Running Sequentially ===\n")
    print(f"Processing {len(locations)} locations with geolocation proxies...")
    print("Each location will use a different proxy to fetch location-specific weather data\n")

    results = []

    for i, location in enumerate(locations, 1):
        print(f"\n[{i}/{len(locations)}] Processing {location['city']}, {location['country']}...")
        result = await get_weather_for_location(location)
        results.append(result)

    display_results(results)
    print("\n=== All locations completed ===")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Application error: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID, BROWSERBASE_API_KEY")
        print("  - Set MODEL_API_KEY (required for AI model)")
        exit(1)
