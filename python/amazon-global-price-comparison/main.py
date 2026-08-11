"""Compare live Amazon prices through regional proxies with Stagehand V4."""

import asyncio
import json
import os
from dataclasses import asdict, dataclass
from urllib.parse import quote_plus

from dotenv import load_dotenv
from pydantic import BaseModel
from stagehand import BrowserbaseProxyConfig, Stagehand, browserbase

load_dotenv()


class Product(BaseModel):
    name: str
    price: str = "N/A"
    rating: str = "N/A"
    reviews_count: str = "N/A"
    product_url: str


@dataclass(frozen=True)
class Country:
    name: str
    code: str
    domain: str
    currency: str
    city: str | None = None


@dataclass
class CountryResult:
    country: str
    country_code: str
    currency: str
    products: list[dict]
    error: str | None = None


COUNTRIES = [
    Country("United States", "US", "www.amazon.com", "USD"),
    Country("United Kingdom", "GB", "www.amazon.co.uk", "GBP", "LONDON"),
    Country("Germany", "DE", "www.amazon.de", "EUR", "BERLIN"),
    Country("France", "FR", "www.amazon.fr", "EUR", "PARIS"),
    Country("Italy", "IT", "www.amazon.it", "EUR", "ROME"),
    Country("Spain", "ES", "www.amazon.es", "EUR", "MADRID"),
]


async def products_for_country(
    query: str,
    country: Country,
    result_count: int,
) -> CountryResult:
    api_key = os.environ.get("BROWSERBASE_API_KEY")
    if not api_key:
        raise RuntimeError("BROWSERBASE_API_KEY is required")
    proxy: BrowserbaseProxyConfig = {
        "type": "browserbase",
        "geolocation": {
            "country": country.code,
            **({"city": country.city} if country.city else {}),
        },
    }

    browser = await browserbase.launch(api_key=api_key, proxies=[proxy])
    try:
        stagehand = await Stagehand.create(
            browser=browser,
            api_url="https://api.stagehand.browserbase.com",
        )
        try:
            pages = await browser.context.pages()
            page = pages[0] if pages else await browser.context.new_page()
            origin = f"https://{country.domain}"
            search_url = f"{origin}/s?k={quote_plus(query)}"
            await page.goto(search_url, wait_until="domcontentloaded", timeout=60_000)

            visible_count = 0
            for _ in range(30):
                value = await page.evaluate(
                    """Array.from(
                      document.querySelectorAll('[data-component-type="s-search-result"]')
                    ).filter((card) =>
                      (card.querySelector('h2')?.textContent?.trim().length ?? 0) > 0 &&
                      card.querySelector('a[href*="/dp/"]')
                    ).length"""
                )
                visible_count = int(value) if isinstance(value, (int, float)) else 0
                if visible_count >= result_count:
                    break
                await page.wait_for_timeout(500)
            if visible_count < result_count:
                raise RuntimeError(f"Only {visible_count} complete product cards rendered")

            raw_products = await page.evaluate(
                f"""Array.from(
                  document.querySelectorAll('[data-component-type="s-search-result"]')
                ).map((card) => {{
                  const links = Array.from(card.querySelectorAll('a[href*="/dp/"]'));
                  const link = card.querySelector('h2 a[href*="/dp/"]') ||
                    links.find((item) => (item.textContent?.trim().length ?? 0) > 10) ||
                    links[0];
                  return {{
                    name: card.querySelector('h2')?.textContent?.trim() ||
                      link?.textContent?.trim() || '',
                    price: card.querySelector('.a-price .a-offscreen')
                      ?.textContent?.trim() || 'N/A',
                    rating: card.querySelector('.a-icon-alt')?.textContent?.trim() || 'N/A',
                    reviews_count: card.querySelector('.s-underline-text')
                      ?.textContent?.trim() || 'N/A',
                    product_url: link?.href || '',
                  }};
                }}).filter((item) => item.name && item.product_url.includes('/dp/'))
                  .slice(0, {result_count})"""
            )
            products = [Product.model_validate(item) for item in raw_products]
            if len(products) != result_count:
                raise RuntimeError(f"Expected {result_count} products, received {len(products)}")
            return CountryResult(
                country=country.name,
                country_code=country.code,
                currency=country.currency,
                products=[product.model_dump() for product in products],
            )
        finally:
            await stagehand.close()
    except Exception as error:
        return CountryResult(
            country=country.name,
            country_code=country.code,
            currency=country.currency,
            products=[],
            error=str(error),
        )
    finally:
        await browser.close()


async def main() -> None:
    query = "iPhone 15 Pro Max 256GB"
    result_count = 3
    country_limit = int(os.environ.get("MAX_COUNTRIES", str(len(COUNTRIES))))
    selected = COUNTRIES[:country_limit]
    results = await asyncio.gather(
        *(products_for_country(query, country, result_count) for country in selected)
    )
    for index, result in enumerate(results):
        if result.products:
            continue
        results[index] = await products_for_country(query, selected[index], result_count)

    failures = [result for result in results if not result.products]
    print(json.dumps([asdict(result) for result in results], indent=2))
    if failures:
        raise RuntimeError(f"Price extraction failed for {len(failures)} countries")
    if len({result.currency for result in results}) < min(2, len(results)):
        raise RuntimeError("Regional results did not include distinct currencies")


if __name__ == "__main__":
    asyncio.run(main())
