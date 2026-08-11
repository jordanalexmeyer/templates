"""Research a live Polymarket prediction market with Stagehand V4."""

import asyncio
import json
import os

from dotenv import load_dotenv
from pydantic import BaseModel

from stagehand import Stagehand, browserbase

load_dotenv()

MARKET_URL = "https://polymarket.com/event/will-elon-musk-rejoin-the-trump-administration-in-2026"


class MarketData(BaseModel):
    market_title: str
    current_odds: str | None
    yes_price: str | None
    no_price: str | None
    total_volume: str | None
    price_change: str | None


async def main() -> None:
    api_key = os.environ.get("BROWSERBASE_API_KEY")
    if not api_key:
        raise RuntimeError("BROWSERBASE_API_KEY is required")

    print("Starting Polymarket research automation...")
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
                MARKET_URL,
                wait_until="domcontentloaded",
                timeout=60_000,
            )

            extracted = await stagehand.extract(
                "Extract the current odds and market information for this prediction market",
                MarketData,
                page=page,
            )
            market = extracted.data
            if "elon musk" not in market.market_title.lower():
                raise RuntimeError(f"Unexpected market title: {market.market_title!r}")
            if not any((market.current_odds, market.yes_price, market.no_price)):
                raise RuntimeError("Market extraction returned no live odds or prices")

            print(json.dumps(market.model_dump(mode="json"), indent=2))
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
