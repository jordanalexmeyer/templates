# Basic reCAPTCHA Solving with Browserbase - See README.md for full documentation

import asyncio
import json
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()


async def main():
    client = AsyncStagehand()

    # Note: solveCaptchas setting needs to be configured at the Browserbase project level
    # or via the session creation API. The v3 SDK uses the default Browserbase settings.
    session = await client.sessions.create(model_name="google/gemini-2.5-pro")

    print("Stagehand initialized successfully!")
    print(f"Session ID: {session.id}")
    print(f"Live View Link: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to reCAPTCHA demo page...")
        await session.navigate(url="https://google.com/recaptcha/api2/demo")

        print("Waiting for captcha to be solved (if enabled at project level)...")
        # Give time for automatic captcha solving
        await asyncio.sleep(10)

        print("Clicking submit button after captcha is solved...")
        await session.act(input="Click the Submit button")

        print("Extracting page content...")
        text = await session.extract(
            instruction="Extract all the text on this page",
            schema={
                "type": "object",
                "properties": {
                    "extraction": {
                        "type": "string",
                        "description": "All text content on the page",
                    }
                },
                "required": ["extraction"],
            },
        )

        print("Page content:")
        print(json.dumps(text.data.result, indent=2))

        extraction_text = text.data.result.get("extraction", "")
        if "Verification Success... Hooray!" in extraction_text:
            print("reCAPTCHA successfully solved!")
        else:
            print("Could not verify captcha success from page content")

    finally:
        await session.end()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error in reCAPTCHA solving example: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Verify solveCaptchas is enabled in your Browserbase project settings")
        print("  - Ensure the demo page is accessible")
        exit(1)
