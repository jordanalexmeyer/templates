# Stagehand + Browserbase: Job Application Automation - See README.md for full documentation

import asyncio
import os
import random
import time

import httpx
from browserbase import Browserbase
from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()


async def get_project_concurrency() -> int:
    bb = Browserbase(api_key=os.environ.get("BROWSERBASE_API_KEY"))
    project = await asyncio.to_thread(
        bb.projects.retrieve, os.environ.get("BROWSERBASE_PROJECT_ID")
    )
    return min(project.concurrency, 5)


def generate_random_email() -> str:
    random_string = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=8))
    return f"agent-{random_string}@example.com"


def generate_agent_id() -> str:
    timestamp = int(time.time() * 1000)
    random_string = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=7))
    return f"agent-{timestamp}-{random_string}"


async def apply_to_job(job_info: dict, semaphore: asyncio.Semaphore):
    async with semaphore:
        client = AsyncStagehand()
        session = await client.sessions.create(model_name="google/gemini-2.5-flash")

        job_title = job_info.get("title", "Unknown")
        job_url = job_info.get("url", "")

        print(f"[{job_title}] Session Started: {session.id}")
        print(f"[{job_title}] Watch live: https://browserbase.com/sessions/{session.id}")

        try:
            await session.navigate(url=job_url)
            print(f"[{job_title}] Navigated to job page")

            await session.act(input=f"click on {job_title}")
            print(f"[{job_title}] Clicked on job")

            agent_id = generate_agent_id()
            email = generate_random_email()

            print(f"[{job_title}] Agent ID: {agent_id}")
            print(f"[{job_title}] Email: {email}")

            await session.act(input=f"type '{agent_id}' into the agent identifier field")
            await session.act(input=f"type '{email}' into the contact endpoint field")
            await session.act(input="type 'us-west-2' into the deployment region field")

            # Note: File upload with observe is not directly supported in v3 SDK
            # Using act() for simpler form interaction
            await session.act(input="select 'Yes' for multi region deployment")
            await session.act(input="click deploy agent button")

            print(f"[{job_title}] Application submitted successfully!")

        except Exception as error:
            print(f"[{job_title}] Error: {error}")
            raise error

        finally:
            await session.end()


async def main():
    print("Starting Job Application Automation...")

    max_concurrency = await get_project_concurrency()
    print(f"Executing with concurrency limit: {max_concurrency}")

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-flash")

    print("Main Stagehand Session Started")
    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        await session.navigate(url="https://agent-job-board.vercel.app/")
        print("Navigated to agent-job-board.vercel.app")

        await session.act(input="click on the view jobs button")
        print("Clicked on view jobs button")

        jobs_result = await session.extract(
            instruction="extract all job listings with their titles and URLs",
            schema={
                "type": "object",
                "properties": {
                    "jobs": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "url": {"type": "string", "description": "Job URL"},
                                "title": {"type": "string", "description": "Job title"},
                            },
                            "required": ["url", "title"],
                        },
                    }
                },
                "required": ["jobs"],
            },
        )

        jobs_data = jobs_result.data.result.get("jobs", [])
        print(f"Found {len(jobs_data)} jobs")

    finally:
        await session.end()

    semaphore = asyncio.Semaphore(max_concurrency)

    print(f"Starting to apply to {len(jobs_data)} jobs with max concurrency of {max_concurrency}")

    application_tasks = [apply_to_job(job, semaphore) for job in jobs_data]
    await asyncio.gather(*application_tasks)

    print("All applications completed!")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error: {err}")
        exit(1)
