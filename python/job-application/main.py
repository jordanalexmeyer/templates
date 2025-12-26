# Stagehand + Browserbase: Job Application Automation - See README.md for full documentation

import asyncio
import os
import random
import time

import httpx
from browserbase import Browserbase
from dotenv import load_dotenv
from pydantic import BaseModel, Field, HttpUrl

from stagehand import Stagehand, StagehandConfig

# Load environment variables
load_dotenv()


# Define Pydantic schemas for structured data extraction
# Using schemas ensures consistent data extraction even if page layout changes
class JobInfo(BaseModel):
    url: HttpUrl = Field(..., description="Job URL")
    title: str = Field(..., description="Job title")


class JobsData(BaseModel):
    jobs: list[JobInfo]


async def get_project_concurrency() -> int:
    """
    Fetch project concurrency limit from Browserbase SDK.

    Retrieves the maximum concurrent sessions allowed for the project,
    capped at 5.
    """
    bb = Browserbase(api_key=os.environ.get("BROWSERBASE_API_KEY"))

    # Use asyncio.to_thread to run synchronous SDK call in thread pool
    project = await asyncio.to_thread(
        bb.projects.retrieve, os.environ.get("BROWSERBASE_PROJECT_ID")
    )
    return min(project.concurrency, 5)


def generate_random_email() -> str:
    """
    Generate a random email address for form submission.

    """
    random_string = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=8))
    return f"agent-{random_string}@example.com"


def generate_agent_id() -> str:
    """
    Generate a unique agent identifier for job applications.

    Combines timestamp and random string to ensure uniqueness across
    multiple job applications and sessions.
    """
    timestamp = int(time.time() * 1000)
    random_string = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=7))
    return f"agent-{timestamp}-{random_string}"


async def apply_to_job(job_info: JobInfo, semaphore: asyncio.Semaphore):
    """
    Apply to a single job posting with automated form filling.

    Uses Stagehand to navigate to job page, fill out application form,
    upload resume, and submit the application.
    """
    # Semaphore ensures we don't exceed project concurrency limits
    async with semaphore:
        # Initialize Stagehand with Browserbase for cloud-based browser automation
        config = StagehandConfig(
            env="BROWSERBASE",
            api_key=os.environ.get("BROWSERBASE_API_KEY"),
            project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
            model_name="google/gemini-2.5-flash",
            model_api_key=os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY"),
        )

        try:
            # Use async context manager for automatic resource management
            async with Stagehand(config) as stagehand:
                print(f"[{job_info.title}] Session Started")

                # Get session ID for live viewing/debugging
                session_id = None
                if hasattr(stagehand, "session_id"):
                    session_id = stagehand.session_id
                elif hasattr(stagehand, "browserbase_session_id"):
                    session_id = stagehand.browserbase_session_id

                if session_id:
                    print(
                        f"[{job_info.title}] Watch live: https://browserbase.com/sessions/{session_id}"
                    )

                page = stagehand.page

                # Navigate to job URL
                await page.goto(str(job_info.url))
                print(f"[{job_info.title}] Navigated to job page")

                # Click on the specific job listing to open application form
                await page.act(f"click on {job_info.title}")
                print(f"[{job_info.title}] Clicked on job")

                # Generate unique identifiers for this application
                agent_id = generate_agent_id()
                email = generate_random_email()

                print(f"[{job_info.title}] Agent ID: {agent_id}")
                print(f"[{job_info.title}] Email: {email}")

                # Fill out application form fields using natural language actions
                # Stagehand's act() method understands natural language instructions
                await page.act(f"type '{agent_id}' into the agent identifier field")

                await page.act(f"type '{email}' into the contact endpoint field")

                await page.act("type 'us-west-2' into the deployment region field")

                # Upload agent profile/resume file
                # Using observe() to find the upload button, then setting files programmatically
                upload_actions = await page.observe("find the file upload button for agent profile")
                if upload_actions and len(upload_actions) > 0:
                    upload_action = upload_actions[0]
                    upload_selector = str(upload_action.selector)
                    if upload_selector:
                        file_input = page.locator(upload_selector)

                        # Fetch resume PDF from remote URL
                        # Using httpx to download the file before uploading
                        resume_url = "https://agent-job-board.vercel.app/Agent%20Resume.pdf"
                        async with httpx.AsyncClient() as client:
                            response = await client.get(resume_url)
                            if response.status_code != 200:
                                raise Exception(f"Failed to fetch resume: {response.status_code}")
                            resume_buffer = response.content

                        # Upload file using Playwright's set_input_files with buffer
                        await file_input.set_input_files(
                            {
                                "name": "Agent Resume.pdf",
                                "mimeType": "application/pdf",
                                "buffer": resume_buffer,
                            }
                        )
                        print(f"[{job_info.title}] Uploaded resume from {resume_url}")

                # Select multi-region deployment option
                await page.act("select 'Yes' for multi region deployment")

                # Submit the application form
                await page.act("click deploy agent button")

                print(f"[{job_info.title}] Application submitted successfully!")

        except Exception as error:
            print(f"[{job_info.title}] Error: {error}")
            raise error


async def main():
    """
    Main application entry point.

    Orchestrates the job application process:
    1. Fetches project concurrency limits
    2. Scrapes job listings from the job board
    3. Applies to all jobs in parallel with concurrency control
    """
    print("Starting Job Application Automation...")

    # Get project concurrency limit to control parallel execution
    max_concurrency = await get_project_concurrency()
    print(f"Executing with concurrency limit: {max_concurrency}")

    # Initialize Stagehand with Browserbase for cloud-based browser automation
    config = StagehandConfig(
        env="BROWSERBASE",
        api_key=os.environ.get("BROWSERBASE_API_KEY"),
        project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
        model_name="google/gemini-2.5-flash",
        model_api_key=os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY"),
    )

    # Use async context manager for automatic resource management
    async with Stagehand(config) as stagehand:
        print("Main Stagehand Session Started")

        # Get session ID for live viewing/debugging
        session_id = None
        if hasattr(stagehand, "session_id"):
            session_id = stagehand.session_id
        elif hasattr(stagehand, "browserbase_session_id"):
            session_id = stagehand.browserbase_session_id

        if session_id:
            print(f"Watch live: https://browserbase.com/sessions/{session_id}")

        page = stagehand.page

        # Navigate to agent job board homepage
        await page.goto("https://agent-job-board.vercel.app/")
        print("Navigated to agent-job-board.vercel.app")

        # Click on "View Jobs" button to access job listings
        await page.act("click on the view jobs button")
        print("Clicked on view jobs button")

        # Extract all job listings with titles and URLs using structured schema
        # Using extract() with Pydantic schema ensures consistent data extraction
        jobs_result = await page.extract(
            "extract all job listings with their titles and URLs", schema=JobsData
        )

        jobs_data = jobs_result.jobs
        print(f"Found {len(jobs_data)} jobs")

    # Create semaphore with concurrency limit to control parallel job applications
    # Semaphore ensures we don't exceed Browserbase project limits
    semaphore = asyncio.Semaphore(max_concurrency)

    # Apply to all jobs in parallel with concurrency control
    # Using asyncio.gather() to run all applications concurrently
    print(f"Starting to apply to {len(jobs_data)} jobs with max concurrency of {max_concurrency}")

    application_tasks = [apply_to_job(job, semaphore) for job in jobs_data]

    # Wait for all applications to complete
    await asyncio.gather(*application_tasks)

    print("All applications completed!")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error: {err}")
        exit(1)
