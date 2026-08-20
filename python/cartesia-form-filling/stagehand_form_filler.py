"""Browser automation for filling web forms during voice conversations.

This module provides the StagehandFormFiller class which manages browser
automation for filling forms using Stagehand. It handles form field
mapping, field filling, and form submission.
"""

import asyncio
import difflib
import os
import re
from dataclasses import dataclass
from enum import Enum

from loguru import logger

from stagehand import Page, Stagehand, StagehandBrowser, browserbase


class FieldType(Enum):
    TEXT = "text"
    EMAIL = "email"
    PHONE = "phone"
    SELECT = "select"
    RADIO = "radio"
    CHECKBOX = "checkbox"
    TEXTAREA = "textarea"


@dataclass
class FormField:
    """Represents a form field with its metadata"""

    field_id: str
    field_type: FieldType
    label: str
    required: bool = False
    options: list[str] | None = None


class FormFieldMapping:
    """Maps conversation questions to actual form fields"""

    def __init__(self):
        self.field_mappings = {
            "full_name": FormField(
                field_id="full_name",
                field_type=FieldType.TEXT,
                label="What is your full name?",
                required=True,
            ),
            "email": FormField(
                field_id="email",
                field_type=FieldType.EMAIL,
                label="What is your email address?",
                required=True,
            ),
            "phone": FormField(
                field_id="phone",
                field_type=FieldType.PHONE,
                label="What is your phone number?",
                required=False,
            ),
            "work_eligibility": FormField(
                field_id="work_eligibility",
                field_type=FieldType.RADIO,
                label="Are you legally eligible to work in this country?",
                options=["Yes", "No"],
                required=True,
            ),
            "availability_type": FormField(
                field_id="availability",
                field_type=FieldType.RADIO,
                label="What's your availability?",
                options=["Temporary", "Part-time", "Full-time"],
                required=True,
            ),
            "additional_info": FormField(
                field_id="additional_info",
                field_type=FieldType.TEXTAREA,
                label="Anything else you'd like to let us know about you?",
                required=False,
            ),
            "role_selection": FormField(
                field_id="role_selection",
                field_type=FieldType.RADIO,
                label="Which of these roles are you applying for?",
                options=[
                    "Sales manager",
                    "IT Support",
                    "Recruiting",
                    "Software engineer",
                    "Marketing specialist",
                ],
                required=True,
            ),
            "previous_experience": FormField(
                field_id="previous_experience",
                field_type=FieldType.RADIO,
                label=("Have you worked in a role similar to this one in the past?"),
                options=["Yes", "No"],
                required=True,
            ),
            "skills_experience": FormField(
                field_id="skills_experience",
                field_type=FieldType.TEXTAREA,
                label=(
                    "What relevant skills and experience do you have "
                    "that make you a strong candidate for this position?"
                ),
                required=True,
            ),
        }

    def get_form_field(self, question_id: str) -> FormField | None:
        """Get the form field mapping for a question ID.

        Args:
            question_id: The question identifier.

        Returns:
            The FormField object or None if not found.
        """
        return self.field_mappings.get(question_id)


class StagehandFormFiller:
    """Manages browser automation for filling forms using Stagehand"""

    def __init__(self, form_url: str):
        self.form_url = form_url
        self.browser: StagehandBrowser | None = None
        self.stagehand: Stagehand | None = None
        self.page: Page | None = None
        self.is_initialized = False
        self.field_mapper = FormFieldMapping()
        self.collected_data: dict[str, str] = {}

    @staticmethod
    def _match_radio_option(answer: str, options: list[str]) -> str | None:
        """Resolve conversational speech to one unambiguous form option."""

        if not options:
            return None

        def normalize(value: str) -> str:
            return " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())

        normalized_answer = normalize(answer)
        normalized_options = {option: normalize(option) for option in options}
        if not normalized_answer:
            return None

        exact = [
            option
            for option, normalized_option in normalized_options.items()
            if normalized_option == normalized_answer
        ]
        if len(exact) == 1:
            return exact[0]

        option_by_value = {value: option for option, value in normalized_options.items()}
        if set(option_by_value) == {"yes", "no"}:
            padded_answer = f" {normalized_answer} "
            if any(
                phrase in padded_answer
                for phrase in (
                    " not sure ",
                    " not certain ",
                    " unsure ",
                    " uncertain ",
                    " don t know ",
                    " do not know ",
                    " can t say ",
                    " cannot say ",
                    " no idea ",
                    " maybe ",
                    " perhaps ",
                )
            ):
                return None
            idiomatic_no = any(
                phrase in padded_answer
                for phrase in (
                    " no problem ",
                    " no problems ",
                    " no issue ",
                    " no issues ",
                    " no worries ",
                )
            )
            affirmative_words = {
                "yes",
                "yeah",
                "yep",
                "yup",
                "affirmative",
                "absolutely",
                "definitely",
            }
            has_affirmative = bool(set(normalized_answer.split()) & affirmative_words)
            has_negative = (" no " in padded_answer and not idiomatic_no) or any(
                phrase in padded_answer
                for phrase in (
                    " nope ",
                    " nah ",
                    " not ",
                    " never ",
                    " cannot ",
                    " can not ",
                    " can t ",
                    " don t ",
                    " do not ",
                    " haven t ",
                    " have not ",
                )
            )
            if has_affirmative != has_negative:
                return option_by_value["yes" if has_affirmative else "no"]
            return None

        padded_answer = f" {normalized_answer} "
        contained = [
            option
            for option, normalized_option in normalized_options.items()
            if f" {normalized_option} " in padded_answer
            or padded_answer in f" {normalized_option} "
        ]
        if len(contained) == 1:
            return contained[0]

        ranked = sorted(
            (
                difflib.SequenceMatcher(None, normalized_answer, normalized_option).ratio(),
                option,
            )
            for option, normalized_option in normalized_options.items()
        )
        best_score, best_option = ranked[-1]
        next_score = ranked[-2][0] if len(ranked) > 1 else 0.0
        if best_score >= 0.65 and best_score - next_score >= 0.1:
            return best_option
        return None

    async def initialize(self) -> None:
        """Initialize Stagehand and open the form.

        Returns:
            None.
        """
        if self.is_initialized:
            return

        try:
            logger.info("Initializing Stagehand browser automation")

            api_key = os.environ.get("BROWSERBASE_API_KEY")
            if not api_key:
                raise RuntimeError("BROWSERBASE_API_KEY is required")
            self.browser = await browserbase.launch(api_key=api_key)
            self.stagehand = await Stagehand.create(
                browser=self.browser,
                api_url="https://api.stagehand.browserbase.com",
            )
            pages = await self.browser.context.pages()
            self.page = pages[0] if pages else await self.browser.context.new_page()

            # Navigate to form
            logger.info(f"Opening form: {self.form_url}")
            await self.page.goto(
                self.form_url,
                wait_until="domcontentloaded",
                timeout=60_000,
            )

            # Wait for form to load
            await asyncio.sleep(2)

            self.is_initialized = True
            logger.info("Browser automation initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize Stagehand: {e}")
            raise

    async def fill_field(self, question_id: str, answer: str) -> bool:
        """Fill a specific form field based on the question ID and answer.

        Args:
            question_id: The question identifier.
            answer: The answer value to fill.

        Returns:
            True if field was filled successfully, False otherwise.
        """
        if not self.is_initialized:
            # Initialize asynchronously without blocking
            init_task = asyncio.create_task(self.initialize())
            await init_task

        try:
            if self.stagehand is None or self.page is None:
                raise RuntimeError("Stagehand form filler is not initialized")

            # Get field mapping
            field = self.field_mapper.get_form_field(question_id)
            if not field:
                logger.warning(f"No field mapping found for question: {question_id}")
                return False

            # Store and use the answer directly
            answer = answer.strip()
            self.collected_data[question_id] = answer

            logger.info(f"Async filling field '{field.label}' with: {answer}")

            # Use Stagehand's natural language API to fill the field
            if field.field_type == FieldType.RADIO:
                matched_option = self._match_radio_option(answer, field.options or [])
                if matched_option is None:
                    raise RuntimeError(f"Could not select {answer} for {field.label}")
                answer = matched_option
                instruction = (
                    f"Within the question '{field.label}', click the option labeled %answer%"
                )
            if field.field_type in [FieldType.TEXT, FieldType.EMAIL, FieldType.PHONE]:
                instruction = f"Fill the '{field.label}' field with %answer%"

            elif field.field_type == FieldType.TEXTAREA:
                instruction = f"Fill the '{field.label}' text area with %answer%"

            elif field.field_type == FieldType.SELECT:
                instruction = (
                    f"Within the question '{field.label}', click the option labeled %answer%"
                )

            elif field.field_type == FieldType.CHECKBOX:
                # For role selection, check the specific role checkbox
                if question_id == "role_selection":
                    instruction = "Check the %answer% checkbox"
                else:
                    # For other checkboxes, check/uncheck based on answer
                    if answer.lower() in ["yes", "true"]:
                        instruction = f"Check the '{field.label}' checkbox"
                    else:
                        instruction = f"Uncheck the '{field.label}' checkbox"

            result = None
            for attempt in range(2):
                result = await self.stagehand.act(
                    instruction,
                    page=self.page,
                    variables={"answer": answer},
                )
                if result.data.success:
                    break
                if attempt == 0:
                    await self.page.wait_for_timeout(750)

            if result is None:
                raise RuntimeError(f"Could not fill {field.label}")
            if not result.data.success:
                raise RuntimeError(result.data.message or f"Could not fill {field.label}")

            return True

        except Exception as e:
            logger.error(f"Error filling field {question_id}: {e}")
            return False

    async def submit_form(self) -> bool:
        """Submit the completed form.

        Returns:
            True if form was submitted successfully, False otherwise.
        """
        try:
            if self.stagehand is None or self.page is None:
                raise RuntimeError("Stagehand form filler is not initialized")
            logger.info("Submitting the form")
            logger.info(f"Form has {len(self.collected_data)} fields filled")

            result = await self.stagehand.act(
                "Click the Apply for a role at AB Technologies submit button",
                page=self.page,
            )
            if not result.data.success:
                raise RuntimeError(result.data.message or "Form submission button was not found")

            # Wait for submission to process
            await asyncio.sleep(1)

            logger.info("Form submitted successfully!")
            return True

        except Exception as e:
            logger.error(f"Error submitting form: {e}")
            return False

    async def cleanup(self) -> None:
        """Clean up browser resources.

        Returns:
            None.
        """
        if self.stagehand:
            try:
                await self.stagehand.close()
            except Exception as error:
                logger.error(f"Error closing Stagehand: {error}")
        if self.browser:
            try:
                await self.browser.close()
            except Exception as error:
                logger.error(f"Error closing browser: {error}")
        logger.info("Session ended")
