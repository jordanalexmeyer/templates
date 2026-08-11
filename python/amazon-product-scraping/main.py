"""Scrape and verify Amazon search results with Stagehand V4."""

import asyncio
import json
import os
from urllib.parse import quote_plus, urljoin

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from stagehand import Stagehand, browserbase

load_dotenv()

SEARCH_QUERY = "Seiko 5"


class Product(BaseModel):
    name: str
    price: str
    rating: str
    reviews_count: str
    product_url: str


class Products(BaseModel):
    products: list[Product] = Field(description="First three Amazon search results")


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
            search_url = f"https://www.amazon.com/s?k={quote_plus(SEARCH_QUERY)}"
            await page.goto(search_url, wait_until="domcontentloaded", timeout=60_000)

            cards = page.locator('[data-component-type="s-search-result"]')
            raw_products: list[dict[str, str]] = []
            for index in range(await cards.count()):
                soup = BeautifulSoup(await cards.nth(index).inner_html(), "html.parser")
                link = soup.select_one('h2 a[href*="/dp/"]') or soup.select_one('a[href*="/dp/"]')
                heading = soup.select_one("h2")
                if link is None or heading is None:
                    continue
                raw_products.append(
                    {
                        "name": heading.get_text(" ", strip=True),
                        "price": (
                            soup.select_one(".a-price .a-offscreen").get_text(strip=True)
                            if soup.select_one(".a-price .a-offscreen")
                            else ""
                        ),
                        "rating": (
                            soup.select_one(".a-icon-alt").get_text(strip=True)
                            if soup.select_one(".a-icon-alt")
                            else ""
                        ),
                        "reviews_count": (
                            soup.select_one(".s-underline-text").get_text(strip=True)
                            if soup.select_one(".s-underline-text")
                            else ""
                        ),
                        "product_url": str(link.get("href", "")),
                    }
                )
                if len(raw_products) == 3:
                    break
            products = Products.model_validate({"products": raw_products}).products
            normalized = [
                product.model_copy(
                    update={"product_url": urljoin("https://www.amazon.com", product.product_url)}
                )
                for product in products
            ]

            if len(normalized) < 3:
                raise RuntimeError(f"Expected 3 products, found {len(normalized)}")
            query_tokens = [token for token in SEARCH_QUERY.lower().split() if len(token) >= 3]
            matches = [
                product
                for product in normalized
                if any(token in product.name.lower() for token in query_tokens)
            ]
            if len(matches) < 2:
                raise RuntimeError(
                    f"Only {len(matches)} products matched the query {SEARCH_QUERY!r}"
                )
            if any("/dp/" not in product.product_url for product in normalized):
                raise RuntimeError("One or more products lacked a detail-page URL")

            print(
                json.dumps(
                    {"products": [product.model_dump() for product in normalized]},
                    indent=2,
                )
            )
        finally:
            await stagehand.close()
    finally:
        await browser.close()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"Amazon product scraping failed: {error}")
        print("Docs: https://docs.stagehand.dev/v4/first-steps/introduction")
        raise
