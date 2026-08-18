"""Verify nurse-license records with Stagehand V4."""

import asyncio
import json
import os

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from stagehand import Stagehand, browserbase

load_dotenv()


class LicenseRecord(BaseModel):
    name: str = Field(min_length=1, description="License holder name")
    license_number: str = Field(min_length=1, description="License number")
    status: str = Field(min_length=1, description="License status")
    more_info_url: str = Field(description="URL for more information")


class LicenseResults(BaseModel):
    list_of_licenses: list[LicenseRecord]


LICENSE_RECORDS = [
    {
        "site": "https://pod-search.kalmservices.net/",
        "first_name": "Ronald",
        "last_name": "Agee",
        "license_number": "346",
    }
]


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


async def main() -> None:
    print("Starting nurse license verification...")
    browser = await browserbase.launch(api_key=require_env("BROWSERBASE_API_KEY"))
    try:
        stagehand = await Stagehand.create(
            browser=browser,
            api_url="https://api.stagehand.browserbase.com",
        )
        try:
            pages = await browser.context.pages()
            page = pages[0] if pages else await browser.context.new_page()

            for record in LICENSE_RECORDS:
                expected_name = f"{record['first_name']} {record['last_name']}"
                print(f"Verifying {expected_name}, license {record['license_number']}")
                await page.goto(
                    record["site"],
                    wait_until="domcontentloaded",
                    timeout=60_000,
                )
                for _ in range(30):
                    if await page.evaluate("Boolean(document.querySelector('#firstName'))"):
                        break
                    await page.wait_for_timeout(1_000)
                else:
                    raise RuntimeError("License search form did not become visible")
                await page.locator("#firstName").fill(record["first_name"])
                await page.locator("#lastName").fill(record["last_name"])
                await page.locator("#licenseNumber").fill(record["license_number"])
                await page.locator('button[type="submit"]').click()
                expected_table_name = f"{record['last_name']}, {record['first_name']}".lower()
                for _ in range(30):
                    if await page.evaluate(
                        "document.body.innerText.toLowerCase().includes("
                        f"{json.dumps(expected_table_name)})"
                    ):
                        break
                    await page.wait_for_timeout(1_000)
                else:
                    raise RuntimeError("License search results did not become visible")

                extracted = await stagehand.extract(
                    "Extract every license result with name, license number, status, and details URL",
                    LicenseResults,
                    page=page,
                )
                results = extracted.data.list_of_licenses
                match = next(
                    (
                        result
                        for result in results
                        if record["license_number"] in result.license_number
                        and record["last_name"].lower() in result.name.lower()
                    ),
                    None,
                )
                if match is None:
                    raise RuntimeError(
                        f"Expected {expected_name} license {record['license_number']} was not found"
                    )
                if not match.status.strip():
                    raise RuntimeError("The matching license had no status")

                print(json.dumps(match.model_dump(mode="json"), indent=2))
                print("License identity and status verified")
        finally:
            await stagehand.close()
    finally:
        await browser.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"Nurse license verification failed: {error}")
        print("Docs: https://docs.stagehand.dev/v4/first-steps/introduction")
        raise
