"""Complete a live RFC 6238 TOTP challenge with Stagehand V4."""

import asyncio
import base64
import hashlib
import hmac
import os
import struct
import time

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from stagehand import Page, Stagehand, browserbase

load_dotenv()

DEMO_URL = "https://authenticationtest.com/totpChallenge/"


class Credentials(BaseModel):
    email: str
    password: str
    totp_secret: str = Field(description="TOTP secret key shown by the demo")


class AuthResult(BaseModel):
    success: bool
    message: str


def generate_totp(secret: str, window: int = 0) -> str:
    normalized = secret.upper().replace(" ", "").rstrip("=")
    padding = "=" * ((8 - len(normalized) % 8) % 8)
    key = base64.b32decode(normalized + padding)
    counter = int(time.time() // 30) + window
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code % 1_000_000).zfill(6)


async def submit(page: Page, credentials: Credentials, code: str) -> None:
    await page.locator("#email").fill(credentials.email)
    await page.locator("#password").fill(credentials.password)
    await page.locator("#totpmfa").fill(code)
    await page.locator('input[type="submit"]').click()


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
            await page.goto(DEMO_URL, wait_until="domcontentloaded", timeout=60_000)
            extracted = await stagehand.extract(
                "Extract the test email, password, and TOTP secret shown on the page",
                Credentials,
                page=page,
            )
            credentials = extracted.data
            if 30 - int(time.time()) % 30 < 8:
                await asyncio.sleep(30 - int(time.time()) % 30 + 1)

            await submit(page, credentials, generate_totp(credentials.totp_secret))
            await page.wait_for_timeout(1_000)
            result = await stagehand.extract(
                "Check whether the TOTP login succeeded and return its message",
                AuthResult,
                page=page,
            )
            if not result.data.success:
                await page.goto(DEMO_URL, wait_until="domcontentloaded")
                if 30 - int(time.time()) % 30 < 8:
                    await asyncio.sleep(30 - int(time.time()) % 30 + 1)
                await submit(page, credentials, generate_totp(credentials.totp_secret))
                await page.wait_for_timeout(1_000)
                result = await stagehand.extract(
                    "Check whether the TOTP login succeeded and return its message",
                    AuthResult,
                    page=page,
                )
            if not result.data.success:
                raise RuntimeError(f"TOTP authentication failed: {result.data.message}")
            print(f"TOTP authentication succeeded: {result.data.message}")
        finally:
            await stagehand.close()
    finally:
        await browser.close()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"TOTP example failed: {error}")
        print("Docs: https://docs.stagehand.dev/v4/first-steps/introduction")
        raise
