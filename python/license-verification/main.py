# Stagehand + Browserbase: Data Extraction with Structured Schemas - See README.md for full documentation

import asyncio
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

# License verification variables
variables = {
    "input1": "02237476"  # DRE License ID to search for
}


async def main():
    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print("Stagehand Session Started")
    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        await session.navigate(url="https://www2.dre.ca.gov/publicasp/pplinfo.asp")
        print("Navigated to: https://www2.dre.ca.gov/publicasp/pplinfo.asp")

        print(f"Performing action: type {variables['input1']} into the License ID input field")
        await session.act(input=f"type {variables['input1']} into the License ID input field")

        print("Performing action: click the Find button")
        await session.act(input="click the Find button")

        # Extract structured license data using JSON schema
        print("Extracting: extract all the license verification details for DRE#02237476")
        extract_response = await session.extract(
            instruction="extract all the license verification details for DRE#02237476",
            schema={
                "type": "object",
                "properties": {
                    "license_type": {
                        "type": "string",
                        "description": "Type of real estate license",
                    },
                    "name": {"type": "string", "description": "License holder's full name"},
                    "mailing_address": {
                        "type": "string",
                        "description": "Current mailing address",
                    },
                    "license_id": {
                        "type": "string",
                        "description": "Unique license identifier",
                    },
                    "expiration_date": {
                        "type": "string",
                        "description": "License expiration date",
                    },
                    "license_status": {
                        "type": "string",
                        "description": "Current status (active, expired, etc.)",
                    },
                    "salesperson_license_issued": {
                        "type": "string",
                        "description": "Date salesperson license was issued",
                    },
                    "former_names": {
                        "type": "string",
                        "description": "Any previous names used",
                    },
                    "responsible_broker": {
                        "type": "string",
                        "description": "Associated broker name",
                    },
                    "broker_license_id": {
                        "type": "string",
                        "description": "Broker's license ID",
                    },
                    "broker_address": {
                        "type": "string",
                        "description": "Broker's business address",
                    },
                    "disciplinary_action": {
                        "type": "string",
                        "description": "Any disciplinary actions taken",
                    },
                    "other_comments": {
                        "type": "string",
                        "description": "Additional relevant information",
                    },
                },
                "required": ["name", "license_id", "license_status"],
            },
        )
        print(f"Extracted: {extract_response.data.result}")

    finally:
        await session.end()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error: {err}")
        exit(1)
