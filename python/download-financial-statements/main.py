# Stagehand + Browserbase: Download Apple's Quarterly Financial Statements - See README.md for full documentation

import asyncio
import os

from browserbase import Browserbase
from dotenv import load_dotenv
from stagehand import AsyncStagehand

# Load environment variables
load_dotenv()


async def save_downloads_with_retry(
    bb: Browserbase, session_id: str, retry_for_seconds: int = 30
) -> int:
    """
    Polls Browserbase for downloaded files and saves them locally.
    Retries until downloads are ready or timeout is reached.
    """
    print(f"Waiting up to {retry_for_seconds} seconds for downloads to complete...")

    start_time = asyncio.get_event_loop().time()
    timeout = retry_for_seconds

    while True:
        elapsed = asyncio.get_event_loop().time() - start_time

        if elapsed >= timeout:
            raise TimeoutError("Download timeout exceeded")

        try:
            print("Checking for downloads...")
            response = await asyncio.to_thread(bb.sessions.downloads.list, session_id)
            download_buffer = await asyncio.to_thread(response.read)

            if len(download_buffer) > 0:
                print(f"Downloads ready! File size: {len(download_buffer)} bytes")

                with open("downloaded_files.zip", "wb") as f:
                    f.write(download_buffer)
                print("Files saved as: downloaded_files.zip")
                return len(download_buffer)
            else:
                print("Downloads not ready yet, retrying...")
        except Exception as e:
            print(f"Error fetching downloads: {e}")
            raise

        await asyncio.sleep(2)


async def main():
    print("Starting Apple Financial Statements Download Automation...")

    print("Initializing Browserbase client...")
    bb = Browserbase(api_key=os.environ.get("BROWSERBASE_API_KEY"))

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-flash")

    print("Stagehand initialized successfully!")
    print(f"Session ID: {session.id}")
    print(f"Live View Link: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to Apple.com...")
        await session.navigate(url="https://www.apple.com/")

        print("Navigating to Investors section...")
        await session.act(input="Click the 'Investors' button at the bottom of the page")
        await session.act(input="Scroll down to the Financial Data section of the page")
        await session.act(input="Under Quarterly Earnings Reports, click on '2025'")

        print("Downloading quarterly financial statements...")
        await session.act(input="Click the 'Financial Statements' link under Q4")
        await session.act(input="Click the 'Financial Statements' link under Q3")
        await session.act(input="Click the 'Financial Statements' link under Q2")
        await session.act(input="Click the 'Financial Statements' link under Q1")

        print("Retrieving downloads from Browserbase...")
        await save_downloads_with_retry(bb, session.id, 45)
        print("All downloads completed successfully!")

    finally:
        await session.end()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Application error: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Verify internet connection and Apple website accessibility")
        exit(1)
