# Stagehand + Browserbase: Website Link Tester - See README.md for full documentation

import asyncio
import json
import os

from dotenv import load_dotenv
from pydantic import BaseModel, Field, HttpUrl

from stagehand import Stagehand, StagehandConfig

# Load environment variables
load_dotenv()

# Base URL whose links we want to crawl and verify
URL = "https://www.browserbase.com"

# Maximum number of links to verify concurrently.
# Default: 1 (sequential processing - works on all plans)
# Set to > 1 for more concurrent link verification (requires Startup or Developer plan or higher).
# For more advanced concurrency control (rate limiting, prioritization, per-domain caps),
# you can also wrap link verification in a Semaphore or similar concurrency primitive.
MAX_CONCURRENT_LINKS = 1


class ExtractedLink(BaseModel):
    """Single hyperlink extracted from the page"""

    url: HttpUrl = Field(..., description="Destination URL of the link")
    link_text: str = Field(..., description="Visible text of the link")


class ExtractedLinks(BaseModel):
    """Collection of extracted links"""

    links: list[ExtractedLink]


class LinkVerificationResult(BaseModel):
    """Result of verifying a single link"""

    link_text: str
    url: HttpUrl
    success: bool
    page_title: str | None = None
    content_matches: bool | None = None
    assessment: str | None = None
    error: str | None = None


class PageVerificationSummary(BaseModel):
    """Structured summary returned from content verification extract()"""

    page_title: str
    content_matches: bool
    assessment: str


# Domains that are treated as social links; we only check that they load,
# and skip content verification because they often require auth/consent flows.
SOCIAL_DOMAINS = [
    "twitter.com",
    "x.com",
    "facebook.com",
    "linkedin.com",
    "instagram.com",
    "youtube.com",
    "tiktok.com",
    "reddit.com",
    "discord.com",
]


def create_stagehand() -> Stagehand:
    """Creates a preconfigured Stagehand instance for Browserbase sessions."""
    config = StagehandConfig(
        env="BROWSERBASE",
        api_key=os.environ.get("BROWSERBASE_API_KEY"),
        project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
        model_name="google/gemini-2.5-pro",
        model_api_key=os.environ.get("GOOGLE_API_KEY"),
        browserbase_session_create_params={
            "project_id": os.environ.get("BROWSERBASE_PROJECT_ID"),
        },
        verbose=0,  # 0 = errors only, 1 = info, 2 = debug
        # (When handling sensitive data like passwords or API keys, set verbose: 0 to prevent secrets from appearing in logs.)
        # https://docs.stagehand.dev/configuration/logging
    )
    return Stagehand(config)


def deduplicate_links(extracted_links: ExtractedLinks) -> list[ExtractedLink]:
    """
    Removes duplicate links by URL while preserving the first occurrence.
    """
    seen_urls: set[str] = set()
    unique_links: list[ExtractedLink] = []

    for link in extracted_links.links:
        url = str(link.url)
        if url in seen_urls:
            continue
        seen_urls.add(url)
        unique_links.append(link)

    return unique_links


async def collect_links_from_homepage() -> list[ExtractedLink]:
    """
    Opens the homepage and uses Stagehand `extract()` to collect all links.
    Returns a de-duplicated list of link objects that we will later verify.
    """
    print("Collecting links from homepage...")

    stagehand: Stagehand | None = None

    try:
        stagehand = create_stagehand()
        async with stagehand:
            await stagehand.init()

            session_id = getattr(stagehand, "session_id", None) or getattr(
                stagehand, "browserbase_session_id", None
            )
            if session_id:
                print(f"Watch live: https://browserbase.com/sessions/{session_id}")

            page = stagehand.page

            # Navigate to the base URL where we will harvest links
            print(f"Navigating to {URL}...")
            await page.goto(URL, wait_until="domcontentloaded")

            print(f"Successfully loaded {URL}. Extracting links...")

            extracted_links: ExtractedLinks = await page.extract(
                "Extract all links on the page with their link text.",
                schema=ExtractedLinks,
            )

            # Remove duplicate URLs and log both raw and unique counts for visibility
            unique_links = deduplicate_links(extracted_links)

            print(
                f"All links on the page ({len(extracted_links.links)} total, {len(unique_links)} unique):"
            )
            print(
                json.dumps(
                    {"links": [link.model_dump(mode="json") for link in unique_links]}, indent=2
                )
            )

            return unique_links

    except Exception as error:
        print(f"Error while collecting links: {error}")
        raise


async def verify_single_link(link: ExtractedLink) -> LinkVerificationResult:
    """
    Verifies a single link by opening it in a dedicated browser session.
    - Confirms the page loads successfully.
    - For non-social links, uses `extract()` to check that the page content
      matches what the link text suggests.
    """
    print(f"\nChecking: {link.link_text} ({link.url})")

    stagehand: Stagehand | None = None

    try:
        stagehand = create_stagehand()
        async with stagehand:
            await stagehand.init()

            session_id = getattr(stagehand, "session_id", None) or getattr(
                stagehand, "browserbase_session_id", None
            )
            if session_id:
                print(
                    f"[{link.link_text}] Live View: https://browserbase.com/sessions/{session_id}"
                )

            page = stagehand.page

            # Detect if this is a social link (we treat those differently)
            is_social_link = any(domain in str(link.url) for domain in SOCIAL_DOMAINS)

            await page.goto(str(link.url), wait_until="domcontentloaded", timeout=30000)

            current_url = page.url

            # Guard against pages that never load or redirect to an invalid URL
            if not current_url or current_url == "about:blank":
                raise Exception("Page failed to load - invalid URL detected")

            print(f"Link opened successfully: {link.link_text}")

            # For social links, we consider a successful load good enough
            if is_social_link:
                print(f"[{link.link_text}] Social media link - skipping content verification")
                return LinkVerificationResult(
                    link_text=link.link_text,
                    url=link.url,
                    success=True,
                    page_title="Social Media Link",
                    content_matches=True,
                    assessment="Social media link loaded successfully (content verification skipped)",
                )

            # Ask the model to read the page and decide whether it matches the link text
            print(f"[{link.link_text}] Verifying page content against link text...")
            verification: PageVerificationSummary = await page.extract(
                f'Does the page content match what the link text "{link.link_text}" suggests? Extract the page title and provide a brief assessment (maximum 8 words).',
                schema=PageVerificationSummary,
            )

            print(f"[{link.link_text}] Page Title: {verification.page_title}")
            print(
                f"[{link.link_text}] Content Matches: {'YES' if verification.content_matches else 'NO'}"
            )
            print(f"[{link.link_text}] Assessment: {verification.assessment}")

            return LinkVerificationResult(
                link_text=link.link_text,
                url=link.url,
                success=True,
                page_title=verification.page_title,
                content_matches=verification.content_matches,
                assessment=verification.assessment,
            )

    except Exception as error:
        error_message = str(error)

        print(f'Failed to verify link "{link.link_text}": {error_message}')

        # On failure, return a structured result capturing the error message
        return LinkVerificationResult(
            link_text=link.link_text,
            url=link.url,
            success=False,
            error=error_message,
        )


async def verify_links_in_batches(
    links: list[ExtractedLink],
) -> list[LinkVerificationResult]:
    """
    Verifies all links in batches to avoid opening too many concurrent sessions.
    Returns a list of LinkVerificationResult objects for all processed links.
    """
    max_concurrent = max(1, MAX_CONCURRENT_LINKS)
    print(f"\nVerifying links in batches of {max_concurrent}...")

    results: list[LinkVerificationResult] = []

    for i in range(0, len(links), max_concurrent):
        batch = links[i : i + max_concurrent]
        batch_number = i // max_concurrent + 1
        total_batches = (len(links) + max_concurrent - 1) // max_concurrent

        print(f"\n=== Processing batch {batch_number}/{total_batches} ({len(batch)} links) ===")

        batch_results = await asyncio.gather(*[verify_single_link(link) for link in batch])
        results.extend(batch_results)

        print(f"\nBatch {batch_number}/{total_batches} complete ({len(results)} total verified)")

    return results


def output_results(results: list[LinkVerificationResult], label: str = "FINAL RESULTS") -> None:
    """
    Logs a JSON summary of all link verification results.
    Falls back to a brief textual summary if JSON serialization fails.
    """
    print("\n" + "=" * 80)
    print(label)
    print("=" * 80)

    final_report = {
        "total_links": len(results),
        "successful": len([r for r in results if r.success]),
        "failed": len([r for r in results if not r.success]),
        "results": [r.model_dump(mode="json") for r in results],
    }

    try:
        print(json.dumps(final_report, indent=2))
    except Exception as stringify_error:
        print(f"Error serializing results: {stringify_error}")
        print("Summary only:")
        print(f"Total: {final_report['total_links']}")
        print(f"Successful: {final_report['successful']}")
        print(f"Failed: {final_report['failed']}")

    print("\n" + "=" * 80)


async def main():
    """
    Orchestrates the full flow:
    1. Collect all links from the homepage.
    2. Verify them in batches.
    3. Print a final JSON report (or partial results if an error occurs).
    """
    print("Starting Website Link Tester (Python)...")

    results: list[LinkVerificationResult] = []

    try:
        links = await collect_links_from_homepage()
        print(f"Collected {len(links)} links, starting verification...")

        results = await verify_links_in_batches(links)

        print("\n✓ All links verified!")
        print(f"Results array length: {len(results)}")

        output_results(results)

        print("Script completed successfully")
    except Exception as error:
        print("\nError occurred during execution:", error)

        if results:
            print(f"\nOutputting partial results ({len(results)} links processed before error):")
            output_results(results, "PARTIAL RESULTS (Error Occurred)")
        else:
            print("No results to output - error occurred before any links were verified")

        raise


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print("Application error:", err)
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Verify GOOGLE_API_KEY is set")
        print("  - Ensure URL is reachable from Browserbase regions")
        print("Docs: https://docs.stagehand.dev/v3/first-steps/introduction")
        raise SystemExit(1)
