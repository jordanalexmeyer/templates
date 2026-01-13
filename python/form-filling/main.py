# Stagehand + Browserbase: Form Filling Automation - See README.md for full documentation

import asyncio
import os

from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

# Form data variables - using random/fake data for testing
first_name = "Alex"
last_name = "Johnson"
company = "TechCorp Solutions"
job_title = "Software Developer"
email = "alex.johnson@techcorp.com"
message = (
    "Hello, I'm interested in learning more about your services and would like to schedule a demo."
)


async def main():
    print("Starting Form Filling Example...")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print(f"Session started: {session.id}")
    print(f"Live View: https://browserbase.com/sessions/{session.id}")

    try:
        await session.navigate(
            url="https://www.browserbase.com/contact",
        )
        print("Navigated to Browserbase contact page")

        print("Filling in contact form...")

        await session.act(input=f'Fill in the first name field with "{first_name}"')
        await session.act(input=f'Fill in the last name field with "{last_name}"')
        await session.act(input=f'Fill in the company field with "{company}"')
        await session.act(input=f'Fill in the job title field with "{job_title}"')
        await session.act(input=f'Fill in the email field with "{email}"')
        await session.act(input=f'Fill in the message field with "{message}"')

        await session.act(input="Click on the How Can we help? dropdown")
        await asyncio.sleep(0.5)
        await session.act(input="Click on the first option from the dropdown")

        print("Form filled successfully! Waiting 3 seconds...")
        await asyncio.sleep(3)

    finally:
        await session.end()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error in form filling example: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Ensure form fields are available on the contact page")
        print("Docs: https://docs.stagehand.dev/v3/first-steps/introduction")
        exit(1)
