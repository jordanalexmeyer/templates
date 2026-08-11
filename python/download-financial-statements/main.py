"""Download and verify Apple's four FY2025 statements with Stagehand V4."""

import asyncio
import json
import os
import time
from pathlib import Path

import httpx
from browserbase import Browserbase
from dotenv import load_dotenv

from stagehand import Stagehand, browserbase

load_dotenv()


async def save_downloads_with_retry(
    client: Browserbase,
    session_id: str,
    retry_for_seconds: int = 45,
) -> int:
    started = time.monotonic()
    while time.monotonic() - started < retry_for_seconds:
        response = await asyncio.to_thread(client.sessions.downloads.list, session_id)
        payload = await asyncio.to_thread(response.read)
        if payload:
            Path("downloaded_files.zip").write_bytes(payload)
            print(f"Saved downloaded_files.zip ({len(payload)} bytes)")
            return len(payload)
        await asyncio.sleep(2)
    raise TimeoutError("Download timeout exceeded")


async def main() -> None:
    api_key = os.environ.get("BROWSERBASE_API_KEY")
    if not api_key:
        raise RuntimeError("BROWSERBASE_API_KEY is required")

    print("Starting Apple Financial Statements Download Automation...")
    api = Browserbase(api_key=api_key)
    browser = await browserbase.launch(api_key=api_key)
    session_id = browser.session_id
    if not session_id:
        await browser.close()
        raise RuntimeError("Browserbase launch did not return a session ID")

    try:
        stagehand = await Stagehand.create(
            browser=browser,
            api_url="https://api.stagehand.browserbase.com",
        )
        try:
            pages = await browser.context.pages()
            page = pages[0] if pages else await browser.context.new_page()
            await page.goto(
                "https://investor.apple.com/investor-relations/default.aspx",
                wait_until="domcontentloaded",
                timeout=60_000,
            )
            statement_urls = await page.evaluate(
                """Array.from(document.querySelectorAll('a'))
                  .filter((link) =>
                    link.textContent?.trim() === 'Financial Statements' &&
                    /fy2025/i.test(link.href)
                  )
                  .map((link) => link.href)
                  .slice(0, 4)"""
            )
            if (
                not isinstance(statement_urls, list)
                or len(statement_urls) != 4
                or len(set(statement_urls)) != 4
            ):
                count = len(statement_urls) if isinstance(statement_urls, list) else 0
                raise RuntimeError(f"Expected four FY2025 statements, found {count}")

            async with httpx.AsyncClient(follow_redirects=True, timeout=30) as http:
                for index, statement_url in enumerate(statement_urls):
                    if not isinstance(statement_url, str):
                        raise RuntimeError("Apple returned a non-string statement URL")
                    response = await http.head(statement_url)
                    if not response.is_success or "application/pdf" not in response.headers.get(
                        "content-type", ""
                    ):
                        raise RuntimeError(f"Q{4 - index} URL did not return a PDF")

                    encoded_url = json.dumps(statement_url)
                    await page.evaluate(
                        f"""(() => {{
                          const link = document.createElement('a');
                          link.href = {encoded_url};
                          link.target = '_blank';
                          document.body.appendChild(link);
                          link.click();
                          link.remove();
                        }})()"""
                    )
                    await page.wait_for_timeout(500)
                    print(f"Triggered FY2025 Q{4 - index} download")

            size = await save_downloads_with_retry(api, session_id)
            if size < 100_000:
                raise RuntimeError(f"Downloaded archive was unexpectedly small: {size} bytes")
            print("All four downloads completed and were validated")
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
