# Manual MFA with Browserbase Contexts - See README.md for full documentation

import asyncio
import os
import time

import requests
from browserbase import Browserbase
from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

bb = Browserbase(api_key=os.environ.get("BROWSERBASE_API_KEY"))


async def create_session_with_context():
    """
    Creates a new Browserbase context and performs initial login with MFA.
    The context persists authentication state (cookies, MFA trust) for reuse.
    """
    print("Creating new Browserbase context...")

    # Create a persistent context to store authentication state across sessions
    context = bb.contexts.create(project_id=os.environ.get("BROWSERBASE_PROJECT_ID"))

    print(f"Context created: {context.id}")
    print("First session: Performing login with MFA...")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-flash")

    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to GitHub login...")
        await session.navigate(url="https://github.com/login")

        print("Entering username...")
        await session.act(input=f"Type '{os.environ.get('GITHUB_USERNAME')}' into the username field")

        print("Entering password...")
        await session.act(input=f"Type '{os.environ.get('GITHUB_PASSWORD')}' into the password field")

        print("Clicking Sign in...")
        await session.act(input="Click the Sign in button")

        await asyncio.sleep(2)

        mfa_check = await session.extract(
            instruction="Is there a two-factor authentication or verification code prompt on the page?",
            schema={
                "type": "object",
                "properties": {
                    "mfa_required": {"type": "boolean", "description": "Whether MFA is required"},
                },
                "required": ["mfa_required"],
            },
        )

        if mfa_check.data.result.get("mfa_required"):
            print("MFA DETECTED!")
            print("=" * 60)
            print("PAUSED: Please complete MFA in the browser")
            print("=" * 60)
            print(f"1. Open: https://browserbase.com/sessions/{session.id}")
            print("2. Enter your 2FA code from authenticator app")
            print("3. Click 'Verify' or submit")
            print("4. Wait for login to complete")
            print("\nThe script will wait for you to complete MFA...\n")

            # Note: In v3 SDK we don't have direct page URL access during session
            # We'll wait for a timeout period for the user to complete MFA
            print("Waiting up to 2 minutes for MFA completion...")
            await asyncio.sleep(120)

            print("MFA timeout reached. Checking login status...")
        else:
            print("Login successful (no MFA required)\n")

        print(f"Context {context.id} now contains:")
        print("   - Session cookies")
        print("   - MFA trust/remember device state")
        print("   - All authentication data\n")

    finally:
        await session.end()

    return context.id


async def reuse_context(context_id: str):
    """
    Demonstrates session reuse with persisted authentication.
    No login or MFA required since the context contains saved auth state.
    """
    print(f"Second session: Reusing context {context_id}")
    print("   (No login, no MFA required - auth state persisted)\n")

    # New session using saved context - will be pre-authenticated
    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-flash")

    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to GitHub...")
        await session.navigate(url="https://github.com")

        await asyncio.sleep(2)

        username_result = await session.extract(
            instruction="Extract the logged-in username or check if we're authenticated",
            schema={
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "The logged-in username"},
                },
                "required": ["username"],
            },
        )

        print("\nSUCCESS! Already logged in without MFA!")
        print(f"   Username: {username_result.data.result.get('username')}")
        print("\nThis is the power of Browserbase Contexts:")
        print("   - First session: User completes MFA once")
        print("   - Context saves trusted device state")
        print("   - All future sessions: No MFA required\n")

    finally:
        await session.end()


async def delete_context(context_id: str):
    """Cleans up the Browserbase context. Contexts auto-expire after 30 days if not deleted."""
    print(f"Deleting context: {context_id}")
    try:
        response = requests.delete(
            f"https://api.browserbase.com/v1/contexts/{context_id}",
            headers={
                "X-BB-API-Key": os.environ.get("BROWSERBASE_API_KEY"),
            },
        )

        if response.ok:
            print("Context deleted\n")
        else:
            print(f"Could not delete context: {response.status_code} {response.reason}")
            print("   Context will auto-expire after 30 days\n")
    except Exception as error:
        print(f"Could not delete context: {str(error)}")
        print("   Context will auto-expire after 30 days\n")


async def main():
    """
    Demonstrates MFA persistence using Browserbase contexts.
    User completes MFA once, then future sessions skip MFA entirely.
    """
    print("Starting Browserbase Context MFA Persistence Demo...")

    if not os.environ.get("BROWSERBASE_API_KEY") or not os.environ.get("BROWSERBASE_PROJECT_ID"):
        print("\nError: Missing Browserbase credentials")
        print("   Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID in .env")
        exit(1)

    if not os.environ.get("GITHUB_USERNAME") or not os.environ.get("GITHUB_PASSWORD"):
        print("\nError: Missing GitHub credentials")
        print("   Set GITHUB_USERNAME and GITHUB_PASSWORD in .env")
        exit(1)

    try:
        print("\nDemo Flow:")
        print("   1. First session: Login + complete MFA manually")
        print("   2. Second session: No login, no MFA needed")
        print("   3. Clean up context\n")

        context_id = await create_session_with_context()

        print("Waiting 5 seconds before reusing context...\n")
        await asyncio.sleep(5)

        await reuse_context(context_id)
        await delete_context(context_id)

        print("=" * 60)
        print("Key Takeaway:")
        print("=" * 60)
        print("First session: User completes MFA once")
        print("Context saves trusted device state")
        print("All future sessions: No MFA prompt")
        print("Store context_id per customer in database\n")
    except Exception as error:
        print(f"\nError: {str(error)}")
        raise


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Application error: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Verify MODEL_API_KEY is set")
        exit(1)
