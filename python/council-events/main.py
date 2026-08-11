"""Extract current Philadelphia City Council events with Stagehand V4."""

import asyncio
import json
import os
import re
from datetime import UTC, datetime

from dotenv import load_dotenv
from pydantic import BaseModel

from stagehand import Stagehand, browserbase

load_dotenv()


class CouncilEvent(BaseModel):
    name: str
    date: str
    time: str


class CouncilEvents(BaseModel):
    results: list[CouncilEvent]


async def main() -> None:
    api_key = os.environ.get("BROWSERBASE_API_KEY")
    if not api_key:
        raise RuntimeError("BROWSERBASE_API_KEY is required")

    year = datetime.now(UTC).year
    print(f"Starting Philadelphia Council Events automation for {year}...")
    browser = await browserbase.launch(api_key=api_key)
    try:
        stagehand = await Stagehand.create(
            browser=browser,
            api_url="https://api.stagehand.browserbase.com",
        )
        try:
            pages = await browser.context.pages()
            page = pages[0] if pages else await browser.context.new_page()
            await page.goto(
                "https://phila.legistar.com/Calendar.aspx",
                wait_until="domcontentloaded",
                timeout=60_000,
            )
            rows = page.locator("tr")
            events: list[CouncilEvent] = []
            for index in range(await rows.count()):
                values = [
                    value.strip()
                    for value in re.split(r"[\t\n]+", await rows.nth(index).inner_text())
                ]
                values = [value for value in values if value]
                event_date = next(
                    (value for value in values if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", value)),
                    None,
                )
                event_time = next(
                    (value for value in values if re.fullmatch(r"\d{1,2}:\d{2} [AP]M", value)),
                    None,
                )
                if event_date and event_time and values[0] not in {event_date, event_time}:
                    events.append(CouncilEvent(name=values[0], date=event_date, time=event_time))
            validated = CouncilEvents(results=events)
            if not events:
                raise RuntimeError(f"No council events were returned for {year}")
            if any(not event.name.strip() or not event.date.strip() for event in events):
                raise RuntimeError("One or more events lacked a name or date")
            if any(str(year) not in event.date for event in events):
                raise RuntimeError(f"One or more events were not from {year}")

            print(f"Found and validated {len(events)} events")
            print(json.dumps(validated.model_dump(mode="json"), indent=2))
        finally:
            await stagehand.close()
    finally:
        await browser.close()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"Application error: {error}")
        print("Docs: https://docs.stagehand.dev/v4/first-steps/introduction")
        raise
