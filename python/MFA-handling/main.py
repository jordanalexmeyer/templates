# Stagehand + Browserbase: MFA Handling - TOTP Automation - See README.md for full documentation

import asyncio
import hashlib
import hmac
import os
import time

from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

# Demo site URL for TOTP challenge testing
DEMO_URL = "https://authenticationtest.com/totpChallenge/"


def generate_totp(secret: str, window: int = 0) -> str:
    """
    Generate TOTP code (Time-based One-Time Password) using RFC 6238 compliant algorithm.
    """
    base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    bits = ""
    hex_str = ""

    secret = secret.upper().rstrip("=")

    for char in secret:
        val = base32chars.find(char)
        if val == -1:
            raise ValueError("Invalid base32 character in secret")
        bits += format(val, "05b")

    for i in range(0, len(bits) - 3, 4):
        chunk = bits[i : i + 4]
        hex_str += format(int(chunk, 2), "x")

    secret_bytes = bytes.fromhex(hex_str)

    time_window = int(time.time() // 30) + window
    time_bytes = time_window.to_bytes(8, byteorder="big")

    hmac_result = hmac.new(secret_bytes, time_bytes, hashlib.sha1).digest()

    offset = hmac_result[-1] & 0xF
    code = (
        ((hmac_result[offset] & 0x7F) << 24)
        | ((hmac_result[offset + 1] & 0xFF) << 16)
        | ((hmac_result[offset + 2] & 0xFF) << 8)
        | (hmac_result[offset + 3] & 0xFF)
    )

    return str(code % 1000000).zfill(6)


async def main():
    """
    Demonstrates automated TOTP (Time-based One-Time Password) handling.
    Extracts credentials from test page, generates TOTP codes, and completes MFA login.
    """
    print("Starting MFA Handling - TOTP Automation...")

    # Initialize Stagehand with Browserbase for cloud-based browser automation.
    # Environment variables used: BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, MODEL_API_KEY
    client = AsyncStagehand()
    session = await client.sessions.create(model_name="openai/gpt-4.1")

    print("Stagehand initialized successfully!")
    print(f"Session ID: {session.id}")
    print(f"Live View Link: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to TOTP Challenge page...")
        await session.navigate(url=DEMO_URL)

        print("Extracting test credentials and TOTP secret...")
        credentials = await session.extract(
            instruction="Extract the test email, password, and TOTP secret key shown on the page",
            schema={
                "type": "object",
                "properties": {
                    "email": {"type": "string", "description": "Email address"},
                    "password": {"type": "string", "description": "Password"},
                    "totp_secret": {
                        "type": "string",
                        "description": "The TOTP secret key for generating codes",
                    },
                },
                "required": ["email", "password", "totp_secret"],
            },
        )

        creds = credentials.data.result
        print(f"Credentials extracted - Email: {creds.get('email')}")

        totp_code = generate_totp(creds.get("totp_secret", ""))
        seconds_left = 30 - (int(time.time()) % 30)
        print(f"Generated TOTP code: {totp_code} (valid for {seconds_left} seconds)")

        print("Filling in email...")
        await session.act(input=f"Type '{creds.get('email')}' into the email field")

        print("Filling in password...")
        await session.act(input=f"Type '{creds.get('password')}' into the password field")

        print("Filling in TOTP code...")
        await session.act(input=f"Type '{totp_code}' into the TOTP code field")

        print("Submitting form...")
        await session.act(input="Click the submit or login button")

        await asyncio.sleep(2)

        print("Checking authentication result...")
        result = await session.extract(
            instruction="Check if the login was successful or if there's an error message",
            schema={
                "type": "object",
                "properties": {
                    "success": {
                        "type": "boolean",
                        "description": "Whether authentication was successful",
                    },
                    "message": {
                        "type": "string",
                        "description": "Success or error message",
                    },
                },
                "required": ["success", "message"],
            },
        )

        auth_result = result.data.result
        if auth_result.get("success"):
            print("SUCCESS! TOTP authentication completed automatically!")
            print(f"Authentication Result: {auth_result.get('message')}")
        else:
            print(f"Authentication may have failed. Message: {auth_result.get('message')}")
            print("Retrying with a fresh TOTP code...")

            new_code = generate_totp(creds.get("totp_secret", ""))
            print(f"New TOTP code: {new_code}")

            await session.act(input="Clear the TOTP code field")
            await session.act(input=f"Type '{new_code}' into the TOTP code field")
            await session.act(input="Click the submit or login button")

            await asyncio.sleep(2)

            retry_result = await session.extract(
                instruction="Check if the login was successful",
                schema={
                    "type": "object",
                    "properties": {
                        "success": {
                            "type": "boolean",
                            "description": "Whether the retry login was successful",
                        }
                    },
                    "required": ["success"],
                },
            )

            if retry_result.data.result.get("success"):
                print("Success on retry!")
            else:
                print("Authentication failed after retry")

    finally:
        await session.end()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error in MFA handling: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Check .env file has MODEL_API_KEY")
        print("  - TOTP code may have expired (try running again)")
        exit(1)
