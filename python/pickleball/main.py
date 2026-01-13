# SF Court Booking Automation - See README.md for full documentation
import asyncio
import os
from datetime import datetime, timedelta

from dotenv import load_dotenv
from InquirerPy import inquirer
from stagehand import AsyncStagehand

load_dotenv()


async def login_to_site(session, email: str, password: str) -> None:
    """Authenticates user with email and password on the SF Rec & Park site."""
    print("Logging in...")
    await session.act(input="Click the Login button")
    await session.act(input=f'Fill in the email or username field with "{email}"')
    await session.act(input="Click the next, continue, or submit button to proceed")
    await session.act(input=f'Fill in the password field with "{password}"')
    await session.act(input="Click the login, sign in, or submit button")
    print("Logged in")


async def select_filters(session, activity: str, time_of_day: str, selected_date: str) -> None:
    """Applies filters for activity type, date, and time of day on the booking page."""
    print("Selecting the activity")
    await session.act(input="Click the activites drop down menu")
    await session.act(input=f"Select the {activity} activity")
    await session.act(input="Click the Done button")

    print(f"Selecting date: {selected_date}")
    await session.act(input="Click the date picker or calendar")

    date_parts = selected_date.split("-")
    if len(date_parts) != 3:
        raise ValueError(f"Invalid date format: {selected_date}. Expected YYYY-MM-DD")

    day_number = int(date_parts[2])
    if day_number < 1 or day_number > 31:
        raise ValueError(f"Invalid day number: {day_number} from date: {selected_date}")

    print(f"Looking for day number: {day_number} in calendar")
    await session.act(input=f"Click on the number {day_number} in the calendar")

    print(f"Selecting time of day: {time_of_day}")
    await session.act(input="Click the time filter or time selection dropdown")
    await session.act(input=f"Select {time_of_day} time period")
    await session.act(input="Click the Done button")

    await session.act(input="Click Available Only button")
    await session.act(input="Click All Facilities dropdown list")
    await session.act(input="Select Accept Reservations checkbox")
    await session.act(input="Click the Done button")


async def check_and_extract_courts(session, time_of_day: str) -> None:
    """Finds and displays available courts, trying alternative time periods if needed."""
    print("Checking for available courts...")

    available_courts = await session.observe(
        instruction="Find all available court booking slots, time slots, or court reservation options"
    )
    court_count = len(available_courts.data.result) if available_courts.data.result else 0
    print(f"Found {court_count} available court options")

    court_schema = {
        "type": "object",
        "properties": {
            "courts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "the name or identifier of the court"},
                        "opening_times": {"type": "string", "description": "the opening hours or operating times"},
                        "location": {"type": "string", "description": "the location or facility name"},
                        "availability": {"type": "string", "description": "availability status"},
                        "duration": {"type": "string", "description": "the duration in minutes"},
                    },
                    "required": ["name", "opening_times", "location", "availability"],
                },
            }
        },
        "required": ["courts"],
    }

    court_data = await session.extract(
        instruction="Extract all available court booking information including court names, time slots, locations, and any other relevant details",
        schema=court_schema,
    )

    courts = court_data.data.result.get("courts", []) if court_data.data.result else []

    has_available_courts = any(
        "no free spots" not in court.get("availability", "").lower()
        and "unavailable" not in court.get("availability", "").lower()
        and "next available" not in court.get("availability", "").lower()
        for court in courts
    )

    if court_count == 0 or not has_available_courts:
        print("No courts available for selected time. Trying different time periods...")

        alternative_times = (
            ["Afternoon", "Evening"]
            if time_of_day == "Morning"
            else ["Morning", "Evening"]
            if time_of_day == "Afternoon"
            else ["Morning", "Afternoon"]
        )

        for alt_time in alternative_times:
            print(f"Trying {alt_time} time period...")
            await session.act(input=f'Click the time filter dropdown that currently shows "{time_of_day}"')
            await session.act(input=f"Select {alt_time} from the time period options")
            await session.act(input="Click the Done button")

            alt_available_courts = await session.observe(
                instruction="Find all available court booking slots, time slots, or court reservation options"
            )
            alt_count = len(alt_available_courts.data.result) if alt_available_courts.data.result else 0
            print(f"Found {alt_count} available court options for {alt_time}")

            if alt_count > 0:
                alt_court_data = await session.extract(
                    instruction="Extract all available court booking information",
                    schema=court_schema,
                )
                alt_courts = alt_court_data.data.result.get("courts", []) if alt_court_data.data.result else []

                has_alt_available = any(
                    "no free spots" not in court.get("availability", "").lower()
                    and "unavailable" not in court.get("availability", "").lower()
                    for court in alt_courts
                )

                if has_alt_available:
                    print(f"Found available courts for {alt_time}!")
                    courts = alt_courts
                    has_available_courts = True
                    break

    if not has_available_courts:
        print("Extracting final court information...")
        final_court_data = await session.extract(
            instruction="Extract all available court booking information",
            schema=court_schema,
        )
        courts = final_court_data.data.result.get("courts", []) if final_court_data.data.result else []

    print("Available Courts:")
    if courts:
        for index, court in enumerate(courts):
            print(f"{index + 1}. {court.get('name')}")
            print(f"   Opening Times: {court.get('opening_times')}")
            print(f"   Location: {court.get('location')}")
            print(f"   Availability: {court.get('availability')}")
            if court.get("duration"):
                print(f"   Duration: {court.get('duration')} minutes")
            print("")
    else:
        print("No court data available to display")


async def book_court(session) -> None:
    """Completes the court booking with participant selection and verification code."""
    print("Starting court booking process...")

    try:
        print("Clicking the top available time slot...")
        await session.act(input="Click the first available time slot or court booking option")

        print("Opening participant dropdown...")
        await session.act(input="Click the participant dropdown menu or select participant field")
        await session.act(input="Click the only named participant in the dropdown!")

        print("Clicking the book button to complete reservation...")
        await session.act(input="Click the book, reserve, or confirm booking button")
        await session.act(input="Click the Send Code Button")

        def validate_code(text):
            if not text.strip():
                raise ValueError("Please enter a verification code")
            return True

        def get_verification_code():
            return inquirer.text(
                message="Please enter the verification code you received:",
                validate=validate_code,
            ).execute()

        verification_code = await asyncio.to_thread(get_verification_code)

        print(f"Verification code: {verification_code}")
        await session.act(input=f'Fill in the verification code field with "{verification_code}"')
        await session.act(input="Click the confirm button")

        print("Checking for booking confirmation...")
        confirmation = await session.extract(
            instruction="Extract any booking confirmation message, success notification, or reservation details",
            schema={
                "type": "object",
                "properties": {
                    "confirmation_message": {"type": "string", "description": "any confirmation or success message"},
                    "booking_details": {"type": "string", "description": "booking details like time, court, etc."},
                    "error_message": {"type": "string", "description": "any error message if booking failed"},
                },
            },
        )

        result = confirmation.data.result
        if result.get("confirmation_message") or result.get("booking_details"):
            print("Booking Confirmed!")
            if result.get("confirmation_message"):
                print(f"{result.get('confirmation_message')}")
            if result.get("booking_details"):
                print(f"{result.get('booking_details')}")

        if result.get("error_message"):
            print("Booking Error:")
            print(result.get("error_message"))

    except Exception as error:
        print(f"Error during court booking: {error}")
        raise error


async def select_activity() -> str:
    def get_activity():
        return inquirer.select(
            message="Please select an activity:",
            choices=[
                {"name": "Tennis", "value": "Tennis"},
                {"name": "Pickleball", "value": "Pickleball"},
            ],
            default="Tennis",
        ).execute()

    activity = await asyncio.to_thread(get_activity)
    print(f"Selected: {activity}")
    return activity


async def select_time_of_day() -> str:
    def get_time_of_day():
        return inquirer.select(
            message="Please select the time of day:",
            choices=[
                {"name": "Morning (Before 12 PM)", "value": "Morning"},
                {"name": "Afternoon (After 12 PM)", "value": "Afternoon"},
                {"name": "Evening (After 5 PM)", "value": "Evening"},
            ],
            default="Morning",
        ).execute()

    time_of_day = await asyncio.to_thread(get_time_of_day)
    print(f"Selected: {time_of_day}")
    return time_of_day


async def select_date() -> str:
    today = datetime.now()
    date_options = []

    for i in range(7):
        date = today + timedelta(days=i)
        day_name = date.strftime("%A")
        month_day = date.strftime("%b %-d")
        full_date = date.strftime("%Y-%m-%d")
        display_name = f"{day_name}, {month_day} (Today)" if i == 0 else f"{day_name}, {month_day}"
        date_options.append({"name": display_name, "value": full_date})

    def get_date():
        return inquirer.select(
            message="Please select a date:", choices=date_options, default=date_options[0]["value"]
        ).execute()

    selected_date = await asyncio.to_thread(get_date)
    selected_date_obj = datetime.strptime(selected_date, "%Y-%m-%d")
    display_date = selected_date_obj.strftime("%A, %B %-d, %Y")
    print(f"Selected: {display_date}")
    return selected_date


async def book_tennis_paddle_court():
    """
    Main booking workflow: login, apply filters, find available courts, and complete reservation.
    Uses interactive prompts for activity, date, and time selection.
    """
    print("Starting tennis/paddle court booking automation in SF...")

    email = os.environ.get("SF_REC_PARK_EMAIL")
    password = os.environ.get("SF_REC_PARK_PASSWORD")

    if not email or not password:
        raise ValueError("Missing SF_REC_PARK_EMAIL or SF_REC_PARK_PASSWORD environment variables")

    # Interactive prompts for user preferences
    activity = await select_activity()
    selected_date = await select_date()
    time_of_day = await select_time_of_day()

    print(f"Booking {activity} courts in San Francisco for {time_of_day} on {selected_date}...")

    # Initialize Stagehand with Browserbase for cloud-based browser automation.
    # Environment variables used: BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, MODEL_API_KEY
    print("Initializing Stagehand with Browserbase")
    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print("Browserbase Session Started")
    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to court booking site...")
        await session.navigate(url="https://www.rec.us/organizations/san-francisco-rec-park")

        await login_to_site(session, email, password)
        await select_filters(session, activity, time_of_day, selected_date)
        await check_and_extract_courts(session, time_of_day)
        await book_court(session)

    finally:
        await session.end()
        print("\nBrowser session closed")


async def main():
    print("Welcome to SF Court Booking Automation!")
    print("")
    print("This tool automates tennis and pickleball court bookings in San Francisco.")
    print("Here's what we'll do:")
    print("")
    print("1. Navigate to https://www.rec.us/organizations/san-francisco-rec-park")
    print("2. Use automated login with your credentials")
    print("3. Select your preferred activity, date, and time")
    print("4. Find and book available courts automatically")
    print("5. Handle verification codes and confirmation")
    print("")

    try:
        await book_tennis_paddle_court()
        print("Court booking completed successfully!")
        print("Your court has been reserved. Check your email for confirmation details.")
    except Exception as error:
        print("Failed to complete court booking")
        print(f"Error: {error}")
        exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Application error: {err}")
        exit(1)
