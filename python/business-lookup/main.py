# Stagehand + Browserbase: Business Lookup with Agent - See README.md for full documentation

import asyncio
import json
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

business_name = "Jalebi Street"


async def main():
    print("Starting business lookup...")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print("Stagehand initialized successfully")
    print(f"Session ID: {session.id}")
    print(f"Live View Link: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to SF Business Registry...")
        await session.navigate(
            url="https://data.sfgov.org/stories/s/Registered-Business-Lookup/k6sk-2y6w/"
        )

        print(f"Searching for business: {business_name}")
        print("Creating Computer Use Agent...")
        result = await session.execute(
            execute_options={
                "instruction": f'Find and look up the business "{business_name}" in the SF Business Registry. Use the DBA Name filter to search for "{business_name}", apply the filter, and click on the business row to view detailed information. Scroll towards the right to see the NAICS code.',
                "max_steps": 30,
            },
            agent_config={
                "model": "google/gemini-2.5-computer-use-preview-10-2025",
            },
            timeout=300.0,
        )

        if hasattr(result.data, "success") and not result.data.success:
            raise Exception("Agent failed to complete the search")

        print("Agent task completed")

        print("Extracting business information...")
        business_info = await session.extract(
            instruction="Extract all visible business information including DBA Name, Ownership Name, Business Account Number, Location Id, Street Address, Business Start Date, Business End Date, Neighborhood, NAICS Code, and NAICS Code Description",
            schema={
                "type": "object",
                "properties": {
                    "dba_name": {"type": "string", "description": "DBA Name"},
                    "ownership_name": {"type": "string", "description": "Ownership Name"},
                    "business_account_number": {"type": "string", "description": "Business Account Number"},
                    "location_id": {"type": "string", "description": "Location Id"},
                    "street_address": {"type": "string", "description": "Street Address"},
                    "business_start_date": {"type": "string", "description": "Business Start Date"},
                    "business_end_date": {"type": "string", "description": "Business End Date"},
                    "neighborhood": {"type": "string", "description": "Neighborhood"},
                    "naics_code": {"type": "string", "description": "NAICS Code"},
                    "naics_code_description": {"type": "string", "description": "NAICS Code Description"},
                },
                "required": ["dba_name", "business_account_number", "naics_code"],
            },
        )

        print("Business information extracted:")
        print(json.dumps(business_info.data.result, indent=2))

    finally:
        await session.end()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error in business lookup: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Verify MODEL_API_KEY is set for the agent")
        exit(1)
