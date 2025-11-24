import os
import asyncio
import time
import random
from typing import List
from dotenv import load_dotenv
from stagehand import Stagehand, StagehandConfig
from browserbase import Browserbase
from pydantic import BaseModel, Field, HttpUrl
import httpx

# Load environment variables
load_dotenv()


# Define JobInfo schema with Pydantic
class JobInfo(BaseModel):
    url: HttpUrl = Field(..., description="Job URL")
    title: str = Field(..., description="Job title")


class JobsData(BaseModel):
    jobs: List[JobInfo]


# Fetch project concurrency limit from Browserbase SDK (maxed at 5)
async def get_project_concurrency() -> int:
    bb = Browserbase(api_key=os.environ.get("BROWSERBASE_API_KEY"))

    project = await asyncio.to_thread(
        bb.projects.retrieve,
        os.environ.get("BROWSERBASE_PROJECT_ID")
    )
    return min(project.concurrency, 5)


# Generate random email
def generate_random_email() -> str:
    random_string = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
    return f"agent-{random_string}@example.com"


# Generate unique agent identifier
def generate_agent_id() -> str:
    timestamp = int(time.time() * 1000)
    random_string = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=7))
    return f"agent-{timestamp}-{random_string}"


# Apply to a single job
async def apply_to_job(job_info: JobInfo, semaphore: asyncio.Semaphore):
    async with semaphore:
        config = StagehandConfig(
            env="BROWSERBASE",
            api_key=os.environ.get("BROWSERBASE_API_KEY"),
            project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
            model_name="google/gemini-2.5-flash",
            model_api_key=os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY")
        )

        try:
            async with Stagehand(config) as stagehand:
                print(f"[{job_info.title}] Session Started")

                session_id = None
                if hasattr(stagehand, 'session_id'):
                    session_id = stagehand.session_id
                elif hasattr(stagehand, 'browserbase_session_id'):
                    session_id = stagehand.browserbase_session_id

                if session_id:
                    print(f"[{job_info.title}] Watch live: https://browserbase.com/sessions/{session_id}")

                page = stagehand.page

                # Navigate to job URL
                await page.goto(str(job_info.url))
                print(f"[{job_info.title}] Navigated to job page")

                # Click on the specific job
                await page.act(f"click on {job_info.title}")
                print(f"[{job_info.title}] Clicked on job")

                # Fill out the form
                agent_id = generate_agent_id()
                email = generate_random_email()

                print(f"[{job_info.title}] Agent ID: {agent_id}")
                print(f"[{job_info.title}] Email: {email}")

                # Fill agent identifier
                await page.act(f"type '{agent_id}' into the agent identifier field")

                # Fill contact endpoint
                await page.act(f"type '{email}' into the contact endpoint field")

                # Fill deployment region
                await page.act(f"type 'us-west-2' into the deployment region field")

                # Upload agent profile
                upload_actions = await page.observe("find the file upload button for agent profile")
                if upload_actions and len(upload_actions) > 0:
                    upload_action = upload_actions[0]
                    upload_selector = str(upload_action.selector)
                    if upload_selector:
                        file_input = page.locator(upload_selector)

                        # Fetch resume from URL
                        resume_url = "https://agent-job-board.vercel.app/Agent%20Resume.pdf"
                        async with httpx.AsyncClient() as client:
                            response = await client.get(resume_url)
                            if response.status_code != 200:
                                raise Exception(f"Failed to fetch resume: {response.status_code}")
                            resume_buffer = response.content

                        await file_input.set_input_files({
                            "name": "Agent Resume.pdf",
                            "mimeType": "application/pdf",
                            "buffer": resume_buffer,
                        })
                        print(f"[{job_info.title}] Uploaded resume from {resume_url}")

                # Select multi-region deployment
                await page.act("select 'Yes' for multi region deployment")

                # Submit the form
                await page.act("click deploy agent button")

                print(f"[{job_info.title}] Application submitted successfully!")

        except Exception as error:
            print(f"[{job_info.title}] Error: {error}")
            raise error


async def main():
    # Get project concurrency limit
    max_concurrency = await get_project_concurrency()
    print(f"Executing with concurrency limit: {max_concurrency}")

    config = StagehandConfig(
        env="BROWSERBASE",
        api_key=os.environ.get("BROWSERBASE_API_KEY"),
        project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
        model_name="google/gemini-2.5-flash",
        model_api_key=os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY")
    )

    async with Stagehand(config) as stagehand:
        print("Main Stagehand Session Started")

        session_id = None
        if hasattr(stagehand, 'session_id'):
            session_id = stagehand.session_id
        elif hasattr(stagehand, 'browserbase_session_id'):
            session_id = stagehand.browserbase_session_id

        if session_id:
            print(f"Watch live: https://browserbase.com/sessions/{session_id}")

        page = stagehand.page

        # Navigate to agent job board
        await page.goto("https://agent-job-board.vercel.app/")
        print("Navigated to agent-job-board.vercel.app")

        # Click on "View Jobs" button
        await page.act("click on the view jobs button")
        print("Clicked on view jobs button")

        # Extract all jobs with titles using extract
        jobs_result = await page.extract(
            "extract all job listings with their titles and URLs",
            schema=JobsData
        )

        jobs_data = jobs_result.jobs
        print(f"Found {len(jobs_data)} jobs")

    # Create semaphore with concurrency limit
    semaphore = asyncio.Semaphore(max_concurrency)

    # Apply to all jobs in parallel with concurrency control
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
