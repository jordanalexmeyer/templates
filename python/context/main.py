# Stagehand + Browserbase: Context Authentication Example - See README.md for full documentation

import asyncio
import os

import requests
from browserbase import Browserbase
from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()


async def create_session_context_id():
    print("Creating new Browserbase context...")
    bb = Browserbase(api_key=os.environ.get("BROWSERBASE_API_KEY"))
    context = bb.contexts.create(project_id=os.environ.get("BROWSERBASE_PROJECT_ID"))

    print(f"Created context ID: {context.id}")

    print("Creating session for initial login...")
    bb_session = bb.sessions.create(
        project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
        browser_settings={
            "context": {
                "id": context.id,
                "persist": True,
            }
        },
    )
    print(f"Live view: https://browserbase.com/sessions/{bb_session.id}")

    print("Connecting Stagehand to session...")
    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print(f"Stagehand Session ID: {session.id}")
    print(f"Live view: https://browserbase.com/sessions/{session.id}")

    email = os.environ.get("SF_REC_PARK_EMAIL")
    password = os.environ.get("SF_REC_PARK_PASSWORD")

    try:
        print("Navigating to SF Rec & Park login page...")
        await session.navigate(url="https://www.rec.us/organizations/san-francisco-rec-park")

        print("Starting login sequence...")
        await session.act(input="Click the Login button")
        await session.act(input=f'Fill in the email or username field with "{email}"')
        await session.act(input="Click the next, continue, or submit button to proceed")
        await session.act(input=f'Fill in the password field with "{password}"')
        await session.act(input="Click the login, sign in, or submit button")
        print("Login sequence completed!")

    finally:
        await session.end()

    print("Authentication state saved to context")
    return {"id": context.id}


async def delete_context(context_id: str):
    try:
        print(f"Cleaning up context: {context_id}")
        response = requests.delete(
            f"https://api.browserbase.com/v1/contexts/{context_id}",
            headers={
                "X-BB-API-Key": os.environ.get("BROWSERBASE_API_KEY"),
            },
        )
        print(f"Context deleted successfully (status: {response.status_code})")
    except Exception as error:
        print(f"Error deleting context: {error}")


async def main():
    print("Starting Context Authentication Example...")
    context_id = await create_session_context_id()

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print("Authenticated session ready!")
    print(f"Session ID: {session.id}")
    print(f"Live view: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to authenticated area (should skip login)...")
        await session.navigate(url="https://www.rec.us/organizations/san-francisco-rec-park")

        await session.act(input="Click on the reservations button")

        print("Extracting user profile data...")
        user_data = await session.extract(
            instruction="Extract the user's full name and address",
            schema={
                "type": "object",
                "properties": {
                    "full_name": {"type": "string", "description": "the user's full name"},
                    "address": {"type": "string", "description": "the user's address"},
                },
                "required": ["full_name", "address"],
            },
        )

        print(f"Extracted user data: {user_data.data.result}")

    finally:
        await session.end()
        print("Session closed successfully")

    await delete_context(context_id["id"])


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error in context authentication example: {err}")
        print("Common issues:")
        print("  - Check .env file has SF_REC_PARK_EMAIL and SF_REC_PARK_PASSWORD")
        print("  - Verify BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY are set")
        exit(1)
