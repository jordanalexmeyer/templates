"""Find jobs with Exa and review applications with Stagehand V4 code mode."""

from __future__ import annotations

import asyncio
import json
import os
from urllib.parse import urlparse

from deepagents import create_deep_agent
from dotenv import load_dotenv
from exa_py import Exa
from langchain_mcp_adapters.tools import load_mcp_tools
from pydantic import BaseModel, ConfigDict, Field

from agent_runtime import (
    BROWSER_INSTRUCTIONS,
    SERVER_NAME,
    create_gateway_model,
    create_stagehand_client,
    require_env,
)

load_dotenv()

APPLICATION_DETAILS = {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "github_url": None,
    "linkedin_url": "https://linkedin.com/in/johndoe",
    "resume_path": "./Dummy_CV.pdf",
    "current_location": "San Francisco, CA",
    "willing_to_relocate": True,
    "requires_sponsorship": False,
    "visa_status": "",
    "phone": "+1-555-123-4567",
    "portfolio_url": "https://johndoe.dev",
    "cover_letter": "I am excited to apply for this position...",
}
COMPANY_QUERY = os.environ.get("COMPANY_QUERY", "AI startups in SF")
NUM_COMPANIES = int(os.environ.get("NUM_COMPANIES", "5"))


class CareersPage(BaseModel):
    company: str
    careers_url: str


class ApplicationReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_title: str
    job_url: str
    fields_filled: list[str] = Field(description="Application fields filled with test data")
    outstanding_fields: list[str]
    github_field_present: bool = Field(description="Whether the application has a GitHub field")
    github_left_blank: bool = Field(
        description="Whether an existing GitHub field was verified blank"
    )
    resume_uploaded: bool
    review_summary: str


class ApplicationResult(BaseModel):
    company: str
    careers_url: str
    success: bool
    review: ApplicationReview | None = None
    error: str | None = None


def describe_error(error: BaseException) -> str:
    if isinstance(error, BaseExceptionGroup):
        details = [describe_error(child) for child in error.exceptions]
        return " | ".join(detail for detail in details if detail)
    return str(error) or type(error).__name__


async def search_careers_pages(exa: Exa) -> list[CareersPage]:
    companies = await asyncio.to_thread(
        exa.search_and_contents,
        COMPANY_QUERY,
        category="company",
        text=True,
        type="auto",
        livecrawl="fallback",
        num_results=NUM_COMPANIES,
    )
    if not companies.results:
        raise RuntimeError("Exa returned no matching companies")

    careers_pages: list[CareersPage] = []
    for company in companies.results:
        company_name = company.title or (urlparse(company.url).hostname or "")
        homepage_results = await asyncio.to_thread(
            exa.search_and_contents,
            f"{company_name} official homepage",
            context=True,
            exclude_domains=[
                "linkedin.com",
                "crunchbase.com",
                "pitchbook.com",
                "cbinsights.com",
                "builtin.com",
            ],
            num_results=5,
            text=True,
            type="deep",
            livecrawl="fallback",
        )
        homepage = next(
            (
                result
                for result in homepage_results.results
                if result.url.startswith("https://") and (urlparse(result.url).hostname or "")
            ),
            None,
        )
        if homepage is None:
            continue
        domain = (urlparse(homepage.url).hostname or "").removeprefix("www.")
        careers = await asyncio.to_thread(
            exa.search_and_contents,
            f"{company_name} {domain} careers page",
            context=True,
            exclude_domains=["linkedin.com"],
            num_results=5,
            text=True,
            type="deep",
            livecrawl="fallback",
        )
        company_terms = {
            token.lower() for token in company_name.replace("-", " ").split() if len(token) >= 4
        }
        same_domain = [
            result
            for result in careers.results
            if (urlparse(result.url).hostname or "").removeprefix("www.") == domain
            or (urlparse(result.url).hostname or "").endswith(f".{domain}")
        ]
        branded_ats = [
            result
            for result in careers.results
            if any(term in f"{result.title or ''} {result.url}".lower() for term in company_terms)
            and any(
                provider in (urlparse(result.url).hostname or "")
                for provider in ("ashbyhq.com", "greenhouse.io", "lever.co", "smartrecruiters.com")
            )
        ]
        direct_same_domain = [
            result
            for result in same_domain
            if any(marker in result.url for marker in ("ashby_jid=", "gh_jid=", "lever-origin="))
        ]
        candidate = next(iter(direct_same_domain or branded_ats or same_domain), None)
        if candidate is not None:
            careers_pages.append(
                CareersPage(
                    company=company_name,
                    careers_url=candidate.url,
                )
            )
    if not careers_pages:
        raise RuntimeError("Exa returned no company careers pages")
    return careers_pages


async def review_application(careers_page: CareersPage, index: int) -> ApplicationResult:
    print(f"[{index + 1}/{NUM_COMPANIES}] Reviewing {careers_page.company}")
    client = create_stagehand_client()
    try:
        async with client.session(SERVER_NAME) as session:
            tools = await load_mcp_tools(session)
            agent = create_deep_agent(
                model=create_gateway_model("anthropic/claude-sonnet-4.6"),
                tools=tools,
                system_prompt=(
                    BROWSER_INSTRUCTIONS
                    + "\nYou are a careful job-application browser agent. Inspect before "
                    "acting, prefer deterministic locators, never invent applicant facts or "
                    "repurpose one field's value for another field, and never submit an "
                    "application. Leave any field without an exact applicant value blank and "
                    "report it for human review. Use no more than 20 browser-tool calls. "
                    "If the first role has no reachable application, inspect at most one other "
                    "role, then return the evidence gathered instead of looping."
                ),
                response_format=ApplicationReview,
            )
            result = await agent.ainvoke(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": (
                                f"Open {careers_page.careers_url}. If a specific open role is "
                                "already selected, use it; otherwise choose the first relevant "
                                "role. Read its requirements, open its application, and "
                                "fill every field possible from this test applicant record:\n"
                                f"{json.dumps(APPLICATION_DETAILS, indent=2)}\n"
                                "The github_url is intentionally null. If a GitHub field exists, "
                                "leave it blank, report it as outstanding, and verify that it is "
                                "still blank; do not substitute the portfolio or LinkedIn URL. "
                                "Report whether a GitHub field was present and left blank. "
                                "Upload the resume when a file input is present. Stop before "
                                "final submission, verify the filled values in the browser, and "
                                "return the structured review."
                            ),
                        }
                    ]
                },
                config={"recursion_limit": 120},
            )
            review: ApplicationReview = result["structured_response"]

        if not review.job_url.startswith("http") or not review.review_summary.strip():
            raise RuntimeError("Agent returned an unverified application review")
        github_filled = any("github" in field.casefold() for field in review.fields_filled)
        github_outstanding = any(
            "github" in field.casefold() for field in review.outstanding_fields
        )
        if github_filled or (
            review.github_field_present and (not review.github_left_blank or not github_outstanding)
        ):
            raise RuntimeError("Agent did not verify that the GitHub field remained blank")
        if not review.github_field_present and review.github_left_blank:
            raise RuntimeError("Agent returned an inconsistent GitHub-field review")
        return ApplicationResult(
            company=careers_page.company,
            careers_url=careers_page.careers_url,
            success=True,
            review=review,
        )
    except Exception as error:
        return ApplicationResult(
            company=careers_page.company,
            careers_url=careers_page.careers_url,
            success=False,
            error=describe_error(error),
        )


async def main() -> None:
    require_env("BROWSERBASE_API_KEY")
    require_env("AI_GATEWAY_API_KEY")
    exa = Exa(api_key=require_env("EXA_API_KEY"))
    careers_pages = await search_careers_pages(exa)
    results = [
        await review_application(careers_page, index)
        for index, careers_page in enumerate(careers_pages)
    ]
    failures = [result for result in results if not result.success]
    print("[" + ",\n".join(result.model_dump_json(indent=2) for result in results) + "]")
    if failures:
        raise RuntimeError(f"{len(failures)} of {len(results)} application reviews failed")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"Exa + Browserbase workflow failed: {error}")
        print("Check BROWSERBASE_API_KEY, AI_GATEWAY_API_KEY, and EXA_API_KEY")
        raise SystemExit(1) from error
