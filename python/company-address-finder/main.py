# Stagehand + Browserbase: Company Address Finder - See README.md for full documentation

import asyncio
import json
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

COMPANY_NAMES = ["Browserbase", "Mintlify", "Wordware", "Reducto"]
MAX_CONCURRENT = 1


async def with_retry(fn, description: str, max_retries: int = 3, delay_ms: int = 2000):
    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            return await fn()
        except Exception as error:
            last_error = error
            if attempt < max_retries:
                print(f"{description} - Attempt {attempt} failed, retrying in {delay_ms}ms...")
                await asyncio.sleep(delay_ms / 1000.0)

    raise Exception(f"{description} - Failed after {max_retries} attempts: {last_error}")


async def process_company(company_name: str) -> dict:
    print(f"\nProcessing: {company_name}")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-pro")

    print(f"[{company_name}] Session ID: {session.id}")
    print(f"[{company_name}] Live View Link: https://browserbase.com/sessions/{session.id}")

    try:
        print(f"[{company_name}] Navigating to Google...")
        await session.navigate(url="https://www.google.com/")

        print(f"[{company_name}] Finding company homepage using CUA agent...")
        await with_retry(
            lambda: session.execute(
                execute_options={
                    "instruction": f"Navigate to the {company_name} website",
                    "max_steps": 5,
                },
                agent_config={
                    "model": "google/gemini-2.5-computer-use-preview-10-2025",
                },
                timeout=120.0,
            ),
            f"[{company_name}] Navigation to website",
        )

        # Note: In v3 SDK, we don't have direct page URL access
        homepage_url = f"https://{company_name.lower()}.com"
        print(f"[{company_name}] Company found")

        print(f"[{company_name}] Finding Terms of Service & Privacy Policy links...")

        tos_result = await session.extract(
            instruction="extract the link to the Terms of Service page",
            schema={
                "type": "object",
                "properties": {
                    "terms_of_service_link": {
                        "type": "string",
                        "description": "The URL link to the Terms of Service page",
                    }
                },
                "required": ["terms_of_service_link"],
            },
        )

        privacy_result = await session.extract(
            instruction="extract the link to the Privacy Policy page",
            schema={
                "type": "object",
                "properties": {
                    "privacy_policy_link": {
                        "type": "string",
                        "description": "The URL link to the Privacy Policy page",
                    }
                },
                "required": ["privacy_policy_link"],
            },
        )

        terms_of_service_link = tos_result.data.result.get("terms_of_service_link", "")
        privacy_policy_link = privacy_result.data.result.get("privacy_policy_link", "")

        print(f"[{company_name}] Terms of Service: {terms_of_service_link}")
        print(f"[{company_name}] Privacy Policy: {privacy_policy_link}")

        address = ""

        if terms_of_service_link:
            print(f"[{company_name}] Extracting address from Terms of Service...")
            await session.navigate(url=terms_of_service_link)

            try:
                address_result = await session.extract(
                    instruction="Extract the physical company mailing address from the Terms of Service page",
                    schema={
                        "type": "object",
                        "properties": {
                            "company_address": {
                                "type": "string",
                                "description": "The physical company mailing address",
                            }
                        },
                        "required": ["company_address"],
                    },
                )

                address = address_result.data.result.get("company_address", "")
                if address:
                    print(f"[{company_name}] Address found in Terms of Service: {address}")
            except Exception:
                print(f"[{company_name}] Could not extract address from Terms of Service page")

        if not address and privacy_policy_link:
            print(f"[{company_name}] Address not found in Terms of Service, trying Privacy Policy...")
            await session.navigate(url=privacy_policy_link)

            try:
                address_result = await session.extract(
                    instruction="Extract the physical company mailing address from the Privacy Policy page",
                    schema={
                        "type": "object",
                        "properties": {
                            "company_address": {
                                "type": "string",
                                "description": "The physical company mailing address",
                            }
                        },
                        "required": ["company_address"],
                    },
                )

                address = address_result.data.result.get("company_address", "")
                if address:
                    print(f"[{company_name}] Address found in Privacy Policy: {address}")
            except Exception:
                print(f"[{company_name}] Could not extract address from Privacy Policy page")

        if not address:
            address = "Address not found"
            print(f"[{company_name}] {address}")

        print(f"[{company_name}] Successfully processed")

        return {
            "company_name": company_name,
            "homepage_url": homepage_url,
            "terms_of_service_link": terms_of_service_link,
            "privacy_policy_link": privacy_policy_link,
            "address": address,
        }

    except Exception as error:
        print(f"[{company_name}] Error: {error}")
        return {
            "company_name": company_name,
            "homepage_url": "",
            "terms_of_service_link": "",
            "privacy_policy_link": "",
            "address": f"Error: {error}",
        }

    finally:
        await session.end()
        print(f"[{company_name}] Session closed successfully")


async def main():
    print("Starting Company Address Finder...")

    company_names = COMPANY_NAMES
    max_concurrent = max(1, MAX_CONCURRENT)
    company_count = len(company_names)
    is_sequential = max_concurrent == 1

    print(
        f"\nProcessing {company_count} {'company' if company_count == 1 else 'companies'} "
        f"{'sequentially' if is_sequential else f'concurrently (batch size: {max_concurrent})'}..."
    )

    all_results = []

    if is_sequential:
        for i, company_name in enumerate(company_names):
            print(f"[{i + 1}/{len(company_names)}] {company_name}")
            result = await process_company(company_name)
            all_results.append(result)
    else:
        for i in range(0, len(company_names), max_concurrent):
            batch = company_names[i : i + max_concurrent]
            batch_number = i // max_concurrent + 1
            total_batches = (len(company_names) + max_concurrent - 1) // max_concurrent

            print(f"\nBatch {batch_number}/{total_batches}: {', '.join(batch)}")

            batch_promises = [process_company(name) for name in batch]
            batch_results = await asyncio.gather(*batch_promises)
            all_results.extend(batch_results)

            print(f"Batch {batch_number}/{total_batches} completed: {len(batch_results)} companies processed")

    print("\n" + "=" * 80)
    print("RESULTS (JSON):")
    print("=" * 80)
    print(json.dumps(all_results, indent=2))
    print("=" * 80)

    print(f"\nComplete: processed {len(all_results)}/{len(company_names)} companies")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Application error: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Verify MODEL_API_KEY is set")
        exit(1)
