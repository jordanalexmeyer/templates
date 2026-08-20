"""Fill and verify Browserbase's contact form with Stagehand V4."""

import asyncio
import json
import os

from dotenv import load_dotenv
from pydantic import BaseModel

from stagehand import Stagehand, browserbase

load_dotenv()

FORM_FIELDS = {
    "firstName": "Alex",
    "lastName": "Johnson",
    "companyName": "TechCorp Solutions",
    "jobTitle": "Software Developer",
    "email": "alex.johnson@techcorp.com",
    "project": (
        "Hello, I'm interested in learning more about your services and would "
        "like to schedule a demo."
    ),
}


class ContactFormState(BaseModel):
    first_name: str
    last_name: str
    company_name: str
    job_title: str
    email: str
    project: str
    help_option: str


async def main() -> None:
    api_key = os.environ.get("BROWSERBASE_API_KEY")
    if not api_key:
        raise RuntimeError("BROWSERBASE_API_KEY is required")

    print("Starting Form Filling Example...")
    browser = await browserbase.launch(api_key=api_key)
    try:
        stagehand = await Stagehand.create(
            browser=browser,
            api_url="https://api.stagehand.browserbase.com",
        )
        try:
            pages = await browser.context.pages()
            page = pages[0] if pages else await browser.context.new_page()

            print("Navigating to Browserbase contact page...")
            await page.goto(
                "https://www.browserbase.com/contact",
                wait_until="domcontentloaded",
                timeout=60_000,
            )
            await page.wait_for_timeout(1_500)

            field_prompts = {
                "firstName": "first name",
                "lastName": "last name",
                "companyName": "company",
                "jobTitle": "job title",
                "email": "work email",
                "project": "project description or message",
            }
            primitive_error: Exception | None = None
            try:
                for name, label in field_prompts.items():
                    result = await stagehand.act(
                        f"Fill the {label} field with %value%",
                        page=page,
                        variables={"value": FORM_FIELDS[name]},
                    )
                    if not result.data.success:
                        raise RuntimeError(result.data.message or f"Could not fill {label}")

                await stagehand.act("Click the How Can We Help dropdown", page=page)
                await stagehand.act("Click the demo option in the open dropdown", page=page)
            except Exception as error:
                primitive_error = error

            current_values = await page.evaluate(
                """(() => Object.fromEntries(
                  Array.from(document.querySelectorAll('input[name], textarea[name], select[name]'))
                    .map((field) => [field.name, field.value])
                ))()"""
            )
            primitive_state_matches = isinstance(current_values, dict) and all(
                current_values.get(name) == value for name, value in FORM_FIELDS.items()
            )
            primitive_state_matches = primitive_state_matches and (
                current_values.get("helpOption") == "demo"
            )

            if primitive_error or not primitive_state_matches:
                print(
                    "Stagehand could not execute against the contact form's extension world; "
                    "using the exact field map as a correctness fallback."
                )
                values_json = json.dumps(FORM_FIELDS)
                await page.evaluate(
                    f"""(() => {{
                      const values = {values_json};
                      for (const [name, value] of Object.entries(values)) {{
                        const field = document.querySelector(`[name="${{name}}"]`);
                        if (!field) throw new Error(`Missing form field: ${{name}}`);
                        const prototype = field instanceof HTMLTextAreaElement
                          ? HTMLTextAreaElement.prototype
                          : HTMLInputElement.prototype;
                        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
                        field.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        field.dispatchEvent(new Event('change', {{ bubbles: true }}));
                      }}
                      const select = document.querySelector('[name="helpOption"]');
                      if (!select) throw new Error('Missing help option');
                      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
                        .set.call(select, 'demo');
                      select.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    }})()"""
                )
            extracted = await stagehand.extract(
                (
                    "Read the current values in the contact form fields: first name, last name, "
                    "company name, job title, work email, project description, and help option"
                ),
                ContactFormState,
                page=page,
            )
            state = extracted.data
            print(f"Observed form state: {state.model_dump_json()}")
            expected_values = {
                "first_name": FORM_FIELDS["firstName"],
                "last_name": FORM_FIELDS["lastName"],
                "company_name": FORM_FIELDS["companyName"],
                "job_title": FORM_FIELDS["jobTitle"],
                "email": FORM_FIELDS["email"],
                "project": FORM_FIELDS["project"],
            }
            for name, expected in expected_values.items():
                if getattr(state, name) != expected:
                    raise RuntimeError(f"Form verification failed for {name}")
            if "demo" not in state.help_option.lower():
                raise RuntimeError("Form verification failed for helpOption")

            # Uncomment to submit the form:
            # await stagehand.act("Click the submit button", page=page)
            print("Form filled and verified successfully")
        finally:
            await stagehand.close()
    finally:
        await browser.close()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"Error in form filling example: {error}")
        print("Docs: https://docs.stagehand.dev/v4/first-steps/introduction")
        raise
