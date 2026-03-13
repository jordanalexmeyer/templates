# Stagehand + Browserbase: LinkedIn Banner Screenshot - See README.md for full documentation

import asyncio  # Python's built-in async I/O library, required to run async functions
import os  # Access to environment variables (e.g., os.environ.get("BROWSERBASE_API_KEY"))
import sys  # Access to command-line arguments (sys.argv) and sys.exit()
from pathlib import Path  # Cross-platform file and directory path handling

from dotenv import load_dotenv  # Reads .env file and loads variables into the environment
from pydantic import BaseModel, Field  # Data validation library; used to define extraction schemas
from stagehand import AsyncStagehand  # The AI browser automation SDK

# Load environment variables from the .env file into os.environ.
# Must be called before any os.environ.get() calls.
load_dotenv()

# ---------------------------------------------------------------------------
# CONSTANTS
# ---------------------------------------------------------------------------

# The Gemini computer-use model. This specific variant supports vision-based
# browser control — it can "see" the screen and click/scroll/type like a human.
# Used only for the autonomous agent (execute) step; not for extract/act/observe.
DEFAULT_MODEL = "google/gemini-2.5-computer-use-preview-10-2025"

# Safety cap on how many individual steps the agent can take.
# Without this limit, a confused agent could loop indefinitely and consume credits.
DEFAULT_MAX_STEPS = 20


# ---------------------------------------------------------------------------
# EXTRACTION SCHEMA
# ---------------------------------------------------------------------------
# Pydantic BaseModel defines the shape of the data we want extract() to return.
# Field(description=...) tells the LLM what each field means so it can find the right value.
class BannerImage(BaseModel):
    """Schema for extracting the LinkedIn company banner image URL."""

    url: str = Field(
        description="The full URL of the banner/cover image on the LinkedIn company page"
    )


def dereference_schema(schema: dict) -> dict:
    """Inline all $ref references in a JSON schema for Gemini compatibility.

    Pydantic's model_json_schema() can produce schemas with $ref references to
    shared definitions. Stagehand's extract() needs a fully self-contained schema,
    so this function recursively replaces $refs with the actual definition.
    """
    defs = schema.pop("$defs", {})

    def resolve_refs(obj: object) -> object:
        if isinstance(obj, dict):
            if "$ref" in obj:
                ref_path = obj["$ref"].split("/")[-1]
                return resolve_refs(defs.get(ref_path, {}))
            return {k: resolve_refs(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [resolve_refs(item) for item in obj]
        return obj

    return resolve_refs(schema)  # type: ignore[return-value]


async def main() -> None:
    # ---------------------------------------------------------------------------
    # ARGUMENT PARSING
    # ---------------------------------------------------------------------------
    # sys.argv is a list of command-line arguments:
    #   sys.argv[0] = path to this script
    #   sys.argv[1] = first argument the user passed (our company name)
    # Example: `python main.py "Browserbase"` → sys.argv[1] == "Browserbase"
    company_name = sys.argv[1] if len(sys.argv) > 1 else None
    if not company_name:
        print('Usage: python main.py "Company Name"')
        sys.exit(1)

    # ---------------------------------------------------------------------------
    # CLIENT INITIALIZATION
    # ---------------------------------------------------------------------------
    # AsyncStagehand is the low-level async client. It reads credentials from
    # environment variables automatically if not passed explicitly.
    # model_api_key is the key for the AI model (Gemini here); it maps to GOOGLE_API_KEY
    # in .env (env var name is GOOGLE_API_KEY, but the SDK parameter is model_api_key).
    client = AsyncStagehand(
        browserbase_api_key=os.environ.get("BROWSERBASE_API_KEY"),
        browserbase_project_id=os.environ.get("BROWSERBASE_PROJECT_ID"),
        model_api_key=os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY"),
    )

    # ---------------------------------------------------------------------------
    # START THE BROWSER SESSION
    # ---------------------------------------------------------------------------
    # sessions.start() spins up a real Chromium browser in Browserbase and returns
    # a session object. All subsequent operations reference this session by ID.
    print("Starting Stagehand session...")
    session = await client.sessions.start(
        # The model Stagehand uses for its own act/observe/extract operations
        # (separate from the CUA agent model configured below).
        model_name="google/gemini-2.5-flash",

        browserbase_session_create_params={
            # proxies: True routes traffic through Browserbase's IP rotation pool.
            # LinkedIn rate-limits and blocks repeated requests from the same IP,
            # so rotating IPs significantly improves reliability.
            # Requires Browserbase Developer plan or higher.
            "proxies": True,
            "browser_settings": {
                # advanced_stealth hardens the browser's fingerprint to reduce bot detection.
                # LinkedIn actively detects and blocks automated browsers, so this helps.
                # Only available on Browserbase Scale plans.
                "advanced_stealth": True,
            },
        },

        # experimental=True unlocks the execute()/CUA agent API.
        # Required for agent mode — same as experimental: true in the TypeScript SDK.
        experimental=True,

        # verbose controls how much Stagehand logs to the console.
        # 0 = errors only, 1 = info (recommended), 2 = full debug output
        verbose=1,
    )

    session_id = session.data.session_id
    print(f"Session started: {session_id}")

    # Print the live session URL. Open this in your browser to watch
    # the agent work in real time from the Browserbase dashboard.
    print(f"Watch live: https://browserbase.com/sessions/{session_id}")

    try:
        # ---------------------------------------------------------------------------
        # NAVIGATE TO GOOGLE
        # ---------------------------------------------------------------------------
        # Start at Google — the agent will take over from here to find LinkedIn.
        print("Navigating to Google...")
        await client.sessions.navigate(id=session_id, url="https://google.com")

        # ---------------------------------------------------------------------------
        # EXECUTE THE CUA AGENT
        # ---------------------------------------------------------------------------
        # sessions.execute() runs a CUA (Computer Use Agent) — an autonomous AI that
        # can see the screen and interact with the browser like a human would.
        #
        # This is different from act/observe/extract:
        #   act/observe/extract — you describe ONE specific action at a time;
        #                         the SDK executes it and returns control.
        #
        #   execute (CUA)       — you give a HIGH-LEVEL GOAL in plain English;
        #                         the agent autonomously plans and executes however
        #                         many steps it needs, using computer vision.
        #
        # Use execute when the navigation path is dynamic (e.g., Google results vary;
        # the agent handles whatever layout it encounters).
        print(f"Agent searching for '{company_name}' LinkedIn page...")
        await client.sessions.execute(
            id=session_id,
            agent_config={
                # mode: "cua" activates Computer Use Agent mode — the agent
                # analyzes screenshots of the screen to decide what to click/type.
                "mode": "cua",

                # model selects the vision model for the agent. The provider is inferred
                # from the "google/" prefix in the model name — no separate provider field needed.
                # api_key is the Google API key for this specific model call.
                "model": {
                    "model_name": DEFAULT_MODEL,
                    "api_key": os.environ.get("GOOGLE_API_KEY"),
                },

                # system_prompt shapes the agent's behavior and persona.
                # Telling it not to ask follow-up questions makes it fully autonomous.
                "system_prompt": "You are a helpful assistant that can use a web browser. Do not ask follow-up questions, use your best judgement.",
            },
            execute_options={
                # The task described in plain English. Be specific about what you want
                # and what constraints apply (e.g., "only via Google search result").
                "instruction": (
                    f"Search for '{company_name} LinkedIn' on Google, click on the most likely "
                    f"LinkedIn result for {company_name}, and wait for the page to fully load. "
                    f"Do not get to the LinkedIn page any other way than via the Google search result."
                ),

                # Hard limit on how many browser actions the agent can take.
                # Prevents runaway loops if the agent gets confused or blocked.
                "max_steps": DEFAULT_MAX_STEPS,
            },
        )

        # ---------------------------------------------------------------------------
        # EXTRACT THE BANNER IMAGE URL
        # ---------------------------------------------------------------------------
        # The agent has landed on the LinkedIn page. Now we use extract() to precisely
        # pull a single structured value from the current page.
        #
        # Why not let the agent extract it too?
        # extract() is more reliable for structured data — it validates the output
        # against the Pydantic schema (BannerImage) so we know it's a real URL.
        print("Extracting banner image URL...")
        extract_response = await client.sessions.extract(
            id=session_id,
            instruction="Extract the banner image URL from the LinkedIn company page",
            # dereference_schema converts the Pydantic model to a flat JSON schema
            # that Stagehand can pass to the LLM.
            schema=dereference_schema(BannerImage.model_json_schema()),
        )
        banner_url = extract_response.data.result["url"]
        print(f"Banner URL: {banner_url}")

        # ---------------------------------------------------------------------------
        # NAVIGATE DIRECTLY TO THE IMAGE
        # ---------------------------------------------------------------------------
        # By navigating to the raw image URL, we strip away all LinkedIn page chrome
        # (header, sidebar, etc.) and get a page showing only the image itself.
        # This makes it easy to screenshot just the banner with no surrounding UI.
        print("Navigating to banner image URL...")
        await client.sessions.navigate(id=session_id, url=banner_url)

        # ---------------------------------------------------------------------------
        # SCREENSHOT VIA PLAYWRIGHT
        # ---------------------------------------------------------------------------
        # To take a pixel-perfect screenshot, we need the Playwright Page object.
        # The Stagehand Python SDK exposes the Browserbase session's debugger URL
        # so we can connect Playwright directly to the same live browser.
        from playwright.async_api import async_playwright

        # session.data.debugger_fullscreen_url is the Chrome DevTools Protocol URL
        # for the live Browserbase session — Playwright can attach to it.
        connect_url = session.data.debugger_fullscreen_url
        if not connect_url:
            # Fall back to constructing the CDP URL from the session ID
            connect_url = f"wss://connect.browserbase.com?apiKey={os.environ.get('BROWSERBASE_API_KEY')}&sessionId={session_id}"

        async with async_playwright() as p:
            # Connect to the existing Browserbase browser (already running).
            # We're not launching a new browser — just attaching to the live one.
            browser = await p.chromium.connect_over_cdp(connect_url)
            context = browser.contexts[0]
            page = context.pages[0]

            # page.evaluate() runs JavaScript inside the browser.
            # getBoundingClientRect() returns the exact pixel coordinates of the <img> element,
            # letting us crop the screenshot precisely to the image bounds.
            bounding_box = await page.evaluate("""() => {
                const img = document.querySelector('img');
                if (!img) return null;
                const rect = img.getBoundingClientRect();
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }""")

            images_dir = Path("images")
            # exist_ok=True: no error if the directory already exists
            images_dir.mkdir(exist_ok=True)

            # Build a filesystem-safe filename from the company name.
            # e.g., "Acme Corp" → "acme-corp-banner.png"
            safe_name = company_name.lower().replace(" ", "-")
            screenshot_path = images_dir / f"{safe_name}-banner.png"

            # page.screenshot() captures the browser viewport as PNG bytes.
            # clip crops to the bounding box of the image element for a pixel-perfect result.
            # If no bounding box was found, fall back to a full-page screenshot.
            buffer = await page.screenshot(clip=bounding_box if bounding_box else None)
            screenshot_path.write_bytes(buffer)
            print(f"Screenshot saved to {screenshot_path}")

            # Disconnect Playwright — we only attached for the screenshot.
            # The Stagehand session stays open until we call sessions.end() in finally.
            await browser.close()

    finally:
        # Always end the session to release the Browserbase browser and stop billing.
        # The `finally` block ensures this runs even if an exception is raised above.
        print("Closing session...")
        await client.sessions.end(id=session_id)
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nCancelled.")
    except Exception as err:
        print(f"Error: {err}")
        print("Common issues:")
        print("  - Check .env has BROWSERBASE_PROJECT_ID, BROWSERBASE_API_KEY, and GOOGLE_API_KEY")
        print("  - Proxies require Browserbase Developer plan or higher")
        print("  - advanced_stealth requires Browserbase Scale plan")
        print("  - Ensure stagehand is installed: uv sync")
        print("Docs: https://docs.stagehand.dev/v3/sdk/python")
        sys.exit(1)
