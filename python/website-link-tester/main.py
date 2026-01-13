# Stagehand + Browserbase: Website Link Tester - See README.md for full documentation

import asyncio
import json
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

URL = "https://www.browserbase.com"
MAX_CONCURRENT_LINKS = 1

SOCIAL_DOMAINS = [
    "twitter.com", "x.com", "facebook.com", "linkedin.com",
    "instagram.com", "youtube.com", "tiktok.com", "reddit.com", "discord.com",
]


def deduplicate_links(links: list) -> list:
    seen_urls: set[str] = set()
    unique_links: list = []
    for link in links:
        url = link.get("url", "")
        if url in seen_urls:
            continue
        seen_urls.add(url)
        unique_links.append(link)
    return unique_links


async def collect_links_from_homepage() -> list:
    print("Collecting links from homepage...")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-pro")

    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        print(f"Navigating to {URL}...")
        await session.navigate(url=URL)
        print(f"Successfully loaded {URL}. Extracting links...")

        extracted = await session.extract(
            instruction="Extract all links on the page with their link text.",
            schema={
                "type": "object",
                "properties": {
                    "links": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "url": {"type": "string", "description": "Destination URL of the link"},
                                "link_text": {"type": "string", "description": "Visible text of the link"},
                            },
                            "required": ["url", "link_text"],
                        },
                    }
                },
                "required": ["links"],
            },
        )

        links = extracted.data.result.get("links", []) if extracted.data.result else []
        unique_links = deduplicate_links(links)

        print(f"All links on the page ({len(links)} total, {len(unique_links)} unique):")
        print(json.dumps({"links": unique_links}, indent=2))

        return unique_links

    finally:
        await session.end()


async def verify_single_link(link: dict) -> dict:
    link_text = link.get("link_text", "")
    link_url = link.get("url", "")

    print(f"\nChecking: {link_text} ({link_url})")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-pro")

    print(f"[{link_text}] Live View: https://browserbase.com/sessions/{session.id}")

    try:
        is_social_link = any(domain in link_url for domain in SOCIAL_DOMAINS)

        await session.navigate(url=link_url)

        print(f"Link opened successfully: {link_text}")

        if is_social_link:
            print(f"[{link_text}] Social media link - skipping content verification")
            return {
                "link_text": link_text,
                "url": link_url,
                "success": True,
                "page_title": "Social Media Link",
                "content_matches": True,
                "assessment": "Social media link loaded successfully",
            }

        print(f"[{link_text}] Verifying page content against link text...")
        verification = await session.extract(
            instruction=f'Does the page content match what the link text "{link_text}" suggests? Extract the page title and provide a brief assessment (maximum 8 words).',
            schema={
                "type": "object",
                "properties": {
                    "page_title": {"type": "string"},
                    "content_matches": {"type": "boolean"},
                    "assessment": {"type": "string"},
                },
                "required": ["page_title", "content_matches", "assessment"],
            },
        )

        result = verification.data.result
        print(f"[{link_text}] Page Title: {result.get('page_title')}")
        print(f"[{link_text}] Content Matches: {'YES' if result.get('content_matches') else 'NO'}")
        print(f"[{link_text}] Assessment: {result.get('assessment')}")

        return {
            "link_text": link_text,
            "url": link_url,
            "success": True,
            "page_title": result.get("page_title"),
            "content_matches": result.get("content_matches"),
            "assessment": result.get("assessment"),
        }

    except Exception as error:
        print(f'Failed to verify link "{link_text}": {error}')
        return {
            "link_text": link_text,
            "url": link_url,
            "success": False,
            "error": str(error),
        }

    finally:
        await session.end()


async def verify_links_in_batches(links: list) -> list:
    max_concurrent = max(1, MAX_CONCURRENT_LINKS)
    print(f"\nVerifying links in batches of {max_concurrent}...")

    results: list = []

    for i in range(0, len(links), max_concurrent):
        batch = links[i : i + max_concurrent]
        batch_number = i // max_concurrent + 1
        total_batches = (len(links) + max_concurrent - 1) // max_concurrent

        print(f"\n=== Processing batch {batch_number}/{total_batches} ({len(batch)} links) ===")

        batch_results = await asyncio.gather(*[verify_single_link(link) for link in batch])
        results.extend(batch_results)

        print(f"\nBatch {batch_number}/{total_batches} complete ({len(results)} total verified)")

    return results


def output_results(results: list, label: str = "FINAL RESULTS") -> None:
    print("\n" + "=" * 80)
    print(label)
    print("=" * 80)

    final_report = {
        "total_links": len(results),
        "successful": len([r for r in results if r.get("success")]),
        "failed": len([r for r in results if not r.get("success")]),
        "results": results,
    }

    print(json.dumps(final_report, indent=2))
    print("\n" + "=" * 80)


async def main():
    print("Starting Website Link Tester (Python)...")

    results: list = []

    try:
        links = await collect_links_from_homepage()
        print(f"Collected {len(links)} links, starting verification...")

        results = await verify_links_in_batches(links)

        print("\nAll links verified!")
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
        print("  - Verify MODEL_API_KEY is set")
        exit(1)
