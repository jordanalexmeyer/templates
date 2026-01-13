# Stagehand + Browserbase: Value Prop One-Liner Generator - See README.md for full documentation

import asyncio
import os

from dotenv import load_dotenv
from openai import OpenAI
from stagehand import AsyncStagehand

# Load environment variables
load_dotenv()

# Domain to analyze - change this to target a different website
target_domain = "www.browserbase.com"  # Or extract from email: email.split("@")[1]

# Initialize OpenAI client for generating one-liners
openai_client = OpenAI()


async def generate_one_liner(domain: str) -> str:
    """
    Analyzes a website's landing page to generate a concise one-liner value proposition.
    Extracts the value prop using Stagehand, then uses an LLM to format it into a short phrase.
    """
    # Initialize Stagehand with Browserbase for cloud-based browser automation.
    # Environment variables used: BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, MODEL_API_KEY
    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print("Stagehand initialized successfully!")
    print(f"Session ID: {session.id}")
    print(f"Live View Link: https://browserbase.com/sessions/{session.id}")

    try:
        print(f"Navigating to https://{domain}...")
        await session.navigate(url=f"https://{domain}/")
        print(f"Successfully loaded {domain}")

        print(f"Extracting value proposition for {domain}...")
        value_prop_data = await session.extract(
            instruction="extract the value proposition from the landing page",
            schema={
                "type": "object",
                "properties": {
                    "value_prop": {
                        "type": "string",
                        "description": "the value proposition from the landing page",
                    }
                },
                "required": ["value_prop"],
            },
        )

        value_prop = value_prop_data.data.result.get("value_prop", "")
        print(f"Extracted value prop for {domain}: {value_prop}")

        if not value_prop or value_prop.lower() in ("null", "undefined"):
            raise ValueError(f"No value prop found for {domain}")

        print(f"Generating email one-liner for {domain}...")

        response = await asyncio.to_thread(
            openai_client.chat.completions.create,
            model="gpt-4.1",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert at generating concise, unique descriptions of companies. Generate ONLY a concise description (no greetings or extra text). Don't use generic adjectives like 'comprehensive', 'innovative', or 'powerful'. Keep it short and concise, no more than 9 words. DO NOT USE QUOTES. Only use English. You MUST start the response with 'your'.",
                },
                {
                    "role": "user",
                    "content": f"""The response will be inserted into this template: "{{response}}"

Examples:
Value prop: "Supercharge your investment team with AI-powered research"
Response: "your AI-powered investment research platform"

Value prop: "The video-first food delivery app"
Response: "your video-first approach to food delivery"

Value prop: "{value_prop}"
Response:""",
                },
            ],
        )

        one_liner = (response.choices[0].message.content or "").strip()

        print("Validating generated one-liner...")
        if (
            not one_liner
            or one_liner.lower() in ("null", "undefined", "your company")
        ):
            raise ValueError(
                f'No valid one-liner generated for {domain}. AI response: "{one_liner}"'
            )

        print(f"Generated one-liner for {domain}: {one_liner}")
        return one_liner

    finally:
        await session.end()
        print("Session closed successfully")


async def main():
    print("Starting One-Liner Generator...")

    try:
        one_liner = await generate_one_liner(target_domain)
        print("\nSuccess!")
        print(f"One-liner: {one_liner}")
    except Exception as error:
        print(f"\nError: {error}")
        print("\nCommon issues:")
        print("  - Check .env file has OPENAI_API_KEY set (required for LLM generation)")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Ensure the domain is accessible")
        exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Fatal error: {err}")
        exit(1)
