# Stagehand + Browserbase: Weather Proxy Demo - See README.md for full documentation

import asyncio
import os

from browserbase import Browserbase
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from stagehand import Stagehand, StagehandConfig

load_dotenv()


class GeolocationConfig(BaseModel):
    """Configuration for geolocation proxy settings"""

    city: str
    country: str
    state: str | None = None


class WeatherResult(BaseModel):
    """Result structure for weather data extraction"""

    city: str
    country: str
    temperature: float
    unit: str
    session_url: str | None = None
    error: str | None = None


class TemperatureData(BaseModel):
    """Schema for temperature extraction"""

    temperature: float = Field(..., description="The current temperature value")
    unit: str = Field(..., description="The temperature unit")


def _build_proxy_config(geolocation: GeolocationConfig) -> dict:
    """Build proxy configuration for geolocation routing."""
    proxy_config = {
        "type": "browserbase",
        "geolocation": {
            "city": geolocation.city,
            "country": geolocation.country,
        },
    }
    if geolocation.state:
        proxy_config["geolocation"]["state"] = geolocation.state
    return proxy_config


async def get_weather_for_location(geolocation: GeolocationConfig) -> WeatherResult:
    """Fetch weather data for a specific location using geolocation proxies."""
    city_name = geolocation.city.replace("_", " ")
    print(f"\n=== Getting weather for {city_name}, {geolocation.country} ===")

    # Create Browserbase session with geolocation proxy
    bb = Browserbase(api_key=os.environ.get("BROWSERBASE_API_KEY"))
    proxy_config = _build_proxy_config(geolocation)
    session = await asyncio.to_thread(
        bb.sessions.create,
        project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
        proxies=[proxy_config],
    )
    session_url = f"https://browserbase.com/sessions/{session.id}"
    print(f"Session URL: {session_url}")

    model_api_key = os.environ.get("MODEL_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not model_api_key:
        raise ValueError(
            "MODEL_API_KEY or GOOGLE_API_KEY environment variable is required. "
            "Please set one in your .env file."
        )

    config = StagehandConfig(
        env="BROWSERBASE",
        api_key=os.environ.get("BROWSERBASE_API_KEY"),
        project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
        model_name=os.environ.get("MODEL_NAME", "google/gemini-2.5-flash"),
        model_api_key=model_api_key,
        verbose=0,
        # 0 = errors only, 1 = info, 2 = debug
        # (When handling sensitive data like passwords or API keys, set verbose: 0 to prevent secrets from appearing in logs.)
        # https://docs.stagehand.dev/configuration/logging
        browserbase_session_id=session.id,
    )

    try:
        async with Stagehand(config) as stagehand:
            print(f"Navigating to weather service for {city_name}...")
            await stagehand.page.goto("https://www.windy.com/", wait_until="domcontentloaded")

            print(f"Extracting temperature data for {city_name}...")
            extract_result = await stagehand.page.extract(
                instruction="Extract the current temperature and its unit",
                schema=TemperatureData,
            )

            print(
                f"Successfully extracted weather data for {city_name}: {extract_result.temperature} {extract_result.unit}"
            )

            return WeatherResult(
                city=city_name,
                country=geolocation.country,
                temperature=extract_result.temperature,
                unit=extract_result.unit,
                session_url=session_url,
            )
    except Exception as error:
        print(f"Error getting weather for {city_name}: {error}")
        return WeatherResult(
            city=city_name,
            country=geolocation.country,
            temperature=0.0,
            unit="",
            session_url=session_url,
            error=str(error),
        )


def display_results(results: list[WeatherResult]):
    """Display formatted weather results for all processed locations."""
    print("\n=== Weather Results ===")
    for result in results:
        if result.error:
            print(f"{result.city}, {result.country}: Error - {result.error}")
        else:
            print(f"{result.city}, {result.country}: {result.temperature} {result.unit}")
        if result.session_url:
            print(f"  Session URL: {result.session_url}")


async def main():
    """Main orchestration function: processes multiple locations sequentially using geolocation proxies."""
    locations = [
        GeolocationConfig(city="NEW_YORK", state="NY", country="US"),
        GeolocationConfig(city="LONDON", country="GB"),
        GeolocationConfig(city="TOKYO", country="JP"),
        GeolocationConfig(city="SAO_PAULO", country="BR"),
    ]

    print("=== Weather Proxy Demo - Running Sequentially ===\n")
    print(f"Processing {len(locations)} locations with geolocation proxies...\n")

    results: list[WeatherResult] = []
    for i, location in enumerate(locations, 1):
        print(f"[{i}/{len(locations)}] Processing {location.city}, {location.country}...")
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
        print("  - Set MODEL_API_KEY or GOOGLE_API_KEY (required for AI model)")
        print(
            "  - Verify geolocation proxy locations are valid (see https://docs.browserbase.com/features/proxies)"
        )
        print("Docs: https://docs.stagehand.dev/v3/first-steps/introduction")
        exit(1)
