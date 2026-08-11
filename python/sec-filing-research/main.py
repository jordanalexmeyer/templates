"""Extract recent Apple SEC filings with Stagehand V4."""

import asyncio
import json
import os
import re

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from stagehand import Stagehand, browserbase

load_dotenv()

SEARCH_QUERY = "Apple Inc"
COMPANY_CIK = "0000320193"
NUM_FILINGS = 5


async def main() -> None:
    api_key = os.environ.get("BROWSERBASE_API_KEY")
    if not api_key:
        raise RuntimeError("BROWSERBASE_API_KEY is required")

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
                f"https://www.sec.gov/edgar/browse/?CIK={COMPANY_CIK}&owner=exclude",
                wait_until="domcontentloaded",
                timeout=60_000,
            )
            await page.wait_for_timeout(2_000)

            company = (await page.locator("h3").first().inner_text()).splitlines()[0]
            rows = page.locator("table tbody tr")
            filings: list[dict[str, str]] = []
            for index in range(await rows.count()):
                soup = BeautifulSoup(await rows.nth(index).inner_html(), "html.parser")
                link = soup.select_one('a[href*="/Archives/edgar/data/"]')
                cells = soup.select("td")
                if link is None or len(cells) < 3:
                    continue
                match = re.search(r"/data/\d+/(\d{18})/", str(link.get("href", "")))
                if match is None:
                    continue
                folder = match.group(1)
                filings.append(
                    {
                        "type": cells[0].get_text(" ", strip=True),
                        "description": cells[1].get_text(" ", strip=True),
                        "date": cells[2].get_text(" ", strip=True),
                        "accession_number": (f"{folder[:10]}-{folder[10:12]}-{folder[12:]}"),
                        "file_number": "",
                    }
                )
                if len(filings) == NUM_FILINGS:
                    break

            if len(filings) != NUM_FILINGS:
                raise RuntimeError(f"Expected {NUM_FILINGS} complete filings")
            if any(
                not filing["type"] or not filing["date"] or not filing["accession_number"]
                for filing in filings
            ):
                raise RuntimeError("One or more SEC filings lacked required metadata")

            result = {
                "company": company or SEARCH_QUERY,
                "cik": COMPANY_CIK,
                "search_query": SEARCH_QUERY,
                "filings": filings,
            }
            print(json.dumps(result, indent=2))
        finally:
            await stagehand.close()
    finally:
        await browser.close()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"SEC filing extraction failed: {error}")
        print("Docs: https://docs.stagehand.dev/v4/first-steps/introduction")
        raise
