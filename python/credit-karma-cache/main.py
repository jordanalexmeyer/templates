# Stagehand + Browserbase: Credit Karma with Caching & Variables - See README.md for full documentation

import asyncio
import os
from datetime import datetime

from dotenv import load_dotenv

from stagehand import Stagehand, StagehandConfig

# Load environment variables
load_dotenv()

# User configuration - modify these values as needed
USER_CONFIG = {
    "credit_score": "Above 760",
    "zipcode": "94109",
    "loan_balance": "500000",
    "home_value": "1000000",
    "cash_out": "200000",
}


def log_line_to_string(log_line: dict) -> str:
    """Format log lines for console output"""
    HIDE_AUXILIARY = True

    try:
        timestamp = log_line.get("timestamp", datetime.now().isoformat())
        auxiliary = log_line.get("auxiliary")

        if auxiliary and auxiliary.get("error"):
            error = auxiliary["error"].get("value", "")
            trace = auxiliary.get("trace", {}).get("value", "")
            return f"{timestamp}::[stagehand:{log_line['category']}] {log_line['message']}\n {error}\n {trace}"

        aux_str = "" if HIDE_AUXILIARY or not auxiliary else f" {auxiliary}"
        return f"{timestamp}::[stagehand:{log_line['category']}] {log_line['message']}{aux_str}"
    except Exception as error:
        print(f"Error logging line: {error}")
        return "error logging line"


async def run():
    """Main automation function"""
    # Initialize Stagehand with Browserbase for cloud-based browser automation.
    # Note: set verbose: 0 to prevent API keys from appearing in logs when handling sensitive data.
    config = StagehandConfig(
        env="BROWSERBASE",
        api_key=os.getenv("BROWSERBASE_API_KEY"),
        project_id=os.getenv("BROWSERBASE_PROJECT_ID"),
        model_name="google/gemini-2.5-flash",
        headless=False,
        verbose=1,  # 0 = errors only, 1 = info, 2 = debug
        # (When handling sensitive data like passwords or API keys, set verbose: 0 to prevent secrets from appearing in logs.)
        # https://docs.stagehand.dev/configuration/logging
        dom_settle_timeout_ms=30_000,
        browserbase_session_create_params={
            "project_id": os.getenv("BROWSERBASE_PROJECT_ID"),
        },
        cache_dir="credit-karma-cache",  # Enable caching for faster subsequent runs
    )

    # Use async context manager for automatic resource management
    async with Stagehand(config) as stagehand:
        page = stagehand.page

        # Display Browserbase session link
        if config.env == "BROWSERBASE" and stagehand.browserbase_session_id:
            print("\n" + "=" * 70)
            print("Browserbase")
            print("=" * 70)
            print(f"View this session live in your browser:")
            print(f"https://browserbase.com/sessions/{stagehand.browserbase_session_id}")
            print("=" * 70 + "\n")

        try:
            print("\n🏠 Starting Credit Karma mortgage rate automation...\n")

            # Navigate to Credit Karma mortgage rates page
            await page.goto(
                "https://www.creditkarma.com/home-loans/mortgage-rates",
                wait_until="domcontentloaded",
            )
            print("✓ Successfully navigated to Credit Karma mortgage rates page")

            # Click on Refinance tab
            await stagehand.act("click on the Refinance tab")
            await page.wait_for_timeout(2000)
            print("✓ Selected Refinance tab")

            # Select credit score using variables
            await stagehand.act(
                "select %creditScore% from the credit score dropdown",
                variables={"creditScore": USER_CONFIG["credit_score"]},
            )
            await page.wait_for_timeout(1000)
            print(f"✓ Selected credit score: {USER_CONFIG['credit_score']}")

            # Input ZIP code using variables
            await stagehand.act(
                "input the ZIP code as %zipcode%",
                variables={"zipcode": USER_CONFIG["zipcode"]},
            )
            await page.wait_for_timeout(1000)
            print(f"✓ Entered ZIP code: {USER_CONFIG['zipcode']}")

            # Input loan balance using variables
            await stagehand.act(
                "input the loan balance as %loanBalance%",
                variables={"loanBalance": USER_CONFIG["loan_balance"]},
            )
            await page.wait_for_timeout(1000)
            print(f"✓ Entered loan balance: ${USER_CONFIG['loan_balance']}")

            # Input estimated home value using variables
            await stagehand.act(
                "input the estimated home value as %homeValue%",
                variables={"homeValue": USER_CONFIG["home_value"]},
            )
            await page.wait_for_timeout(1000)
            print(f"✓ Entered home value: ${USER_CONFIG['home_value']}")

            # Input cash-out amount using variables
            await stagehand.act(
                "input the cash-out amount as %cashOut%",
                variables={"cashOut": USER_CONFIG["cash_out"]},
            )
            await page.wait_for_timeout(1000)
            print(f"✓ Entered cash-out amount: ${USER_CONFIG['cash_out']}")

            # Click Get my rates button
            await stagehand.act("click on the 'Get my rates' button")
            print("✓ Clicked 'Get my rates' button")

            # Wait for results to load
            await page.wait_for_timeout(5000)
            print("\n✓ Mortgage rates loaded successfully!\n")

            # Display summary
            print("┌─────────────────────────────────────┐")
            print("│ Credit Karma Refinance Query        │")
            print("├─────────────────────────────────────┤")
            print(f"│ Credit Score: {USER_CONFIG['credit_score']:<21} │")
            print(f"│ ZIP Code: {USER_CONFIG['zipcode']:<27} │")
            print(f"│ Loan Balance: ${USER_CONFIG['loan_balance']:<20} │")
            print(f"│ Home Value: ${USER_CONFIG['home_value']:<22} │")
            print(f"│ Cash Out: ${USER_CONFIG['cash_out']:<24} │")
            print("└─────────────────────────────────────┘")

        except Exception as error:
            print(f"\n✗ Navigation failed: {error}")
            # Take a screenshot on failure
            await page.screenshot(path="error-screenshot.png", full_page=True)
            print("📸 Screenshot saved to error-screenshot.png")
            raise

    print(
        "\n🤘 Thanks for using Stagehand! Create an issue if you have any feedback: "
        "https://github.com/browserbase/stagehand/issues/new\n"
    )


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception as err:
        print(f"Error in Credit Karma automation: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Verify network connectivity to Credit Karma")
        print("Docs: https://docs.stagehand.dev/v3/first-steps/introduction")
        exit(1)
