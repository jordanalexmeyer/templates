# Stagehand + Browserbase: Automated Nurse License Verification - See README.md for full documentation

import asyncio
import json
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

# License records to verify - add more records as needed
LICENSE_RECORDS = [
    {
        "Site": "https://pod-search.kalmservices.net/",
        "FirstName": "Ronald",
        "LastName": "Agee",
        "LicenseNumber": "346",
    },
]


async def main():
    print("Starting Nurse License Verification Automation...")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print("Initializing browser session...")
    print("Stagehand session started successfully")
    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        for license_record in LICENSE_RECORDS:
            print(
                f"Verifying license for: {license_record['FirstName']} {license_record['LastName']}"
            )

            print(f"Navigating to: {license_record['Site']}")
            await session.navigate(url=license_record["Site"])
            await asyncio.sleep(1)

            print("Filling in license information...")
            await session.act(
                input=f'Type "{license_record["FirstName"]}" into the first name field'
            )
            await session.act(
                input=f'Type "{license_record["LastName"]}" into the last name field'
            )
            await session.act(
                input=f'Type "{license_record["LicenseNumber"]}" into the license number field'
            )

            print("Clicking search button...")
            await session.act(input="Click the search button")

            await asyncio.sleep(1)

            print("Extracting license verification results...")
            results = await session.extract(
                instruction="Extract ALL the license verification results from the page, including name, license number and status",
                schema={
                    "type": "object",
                    "properties": {
                        "list_of_licenses": {
                            "type": "array",
                            "description": "array of license verification results",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {
                                        "type": "string",
                                        "description": "the name of the license holder",
                                    },
                                    "license_number": {
                                        "type": "string",
                                        "description": "the license number",
                                    },
                                    "status": {
                                        "type": "string",
                                        "description": "the status of the license",
                                    },
                                    "more_info_url": {
                                        "type": "string",
                                        "description": "URL for more information",
                                    },
                                },
                                "required": ["name", "license_number", "status"],
                            },
                        }
                    },
                    "required": ["list_of_licenses"],
                },
            )

            print("License verification results extracted:")
            print(json.dumps(results.data.result, indent=2))

    finally:
        await session.end()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Application error: {err}")
        print("\nCommon issues:")
        print("1. Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("2. Verify MODEL_API_KEY is set in environment")
        print("3. Ensure internet access and license verification site is accessible")
        exit(1)
