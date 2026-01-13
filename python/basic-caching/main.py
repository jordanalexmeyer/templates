# Stagehand + Browserbase: Basic Caching - See README.md for full documentation

import asyncio
import json
import os
from pathlib import Path
from typing import Any

import aiofiles
from dotenv import load_dotenv
from stagehand import AsyncStagehand

load_dotenv()

CACHE_FILE = Path(__file__).parent / "cache.json"


async def get_cache(key: str) -> dict[str, Any] | None:
    try:
        async with aiofiles.open(CACHE_FILE) as f:
            cache_content = await f.read()
            parsed = json.loads(cache_content)
            return parsed.get(key)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


async def set_cache(key: str, value: Any) -> None:
    try:
        async with aiofiles.open(CACHE_FILE) as f:
            cache_content = await f.read()
            parsed = json.loads(cache_content)
    except (FileNotFoundError, json.JSONDecodeError):
        parsed = {}

    if hasattr(value, "model_dump"):
        parsed[key] = value.model_dump()
    elif hasattr(value, "dict"):
        parsed[key] = value.dict()
    elif isinstance(value, dict):
        parsed[key] = value
    else:
        parsed[key] = dict(value) if hasattr(value, "__dict__") else value

    async with aiofiles.open(CACHE_FILE, "w") as f:
        await f.write(json.dumps(parsed, indent=2, default=str))


async def act_with_cache(session, key: str, prompt: str, self_heal: bool = False):
    try:
        cache_exists = await get_cache(key)

        if cache_exists:
            action = cache_exists
            print(f"  Cache hit for: {prompt}")
        else:
            print(f"  Observing: {prompt}")
            observe_result = await session.observe(instruction=prompt)
            actions = observe_result.data.result
            if actions and len(actions) > 0:
                action = actions[0]
                if hasattr(action, "to_dict"):
                    action = action.to_dict(exclude_none=True)
            else:
                action = {"input": prompt}

            await set_cache(key, action)
            print(f"  Cached action for: {prompt}")

        await session.act(input=action)
    except Exception as e:
        print(f"  Error: {e}")
        if self_heal:
            print("  Attempting to self-heal...")
            await session.act(input=prompt)
        else:
            raise e


async def run_without_cache():
    print("RUN 1: WITHOUT CACHING")

    start_time = asyncio.get_event_loop().time()

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-flash")

    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to Stripe checkout...")
        await session.navigate(url="https://checkout.stripe.dev/preview")

        await session.act(input="Click on the View Demo button")
        await session.act(input="Type 'test@example.com' into the email field")
        await session.act(input="Type '4242424242424242' into the card number field")
        await session.act(input="Type '12/34' into the expiration date field")

        elapsed = f"{(asyncio.get_event_loop().time() - start_time):.2f}"

        print(f"Total time: {elapsed}s")
        print("Cost: ~$0.01-0.05 (4 LLM calls)")
        print("API calls: 4 (one per action)\n")

        return {"elapsed": elapsed, "llm_calls": 4}

    finally:
        await session.end()


async def run_with_cache():
    print("RUN 2: WITH CACHING\n")

    start_time = asyncio.get_event_loop().time()

    client = AsyncStagehand()
    session = await client.sessions.create(model_name="google/gemini-2.5-flash")

    print(f"Session ID: {session.id}")
    print(f"Watch live: https://browserbase.com/sessions/{session.id}")

    try:
        print("Navigating to Stripe checkout...")
        await session.navigate(url="https://checkout.stripe.dev/preview")

        await act_with_cache(
            session, "Click on the View Demo button", "Click on the View Demo button"
        )
        await act_with_cache(
            session,
            "Type 'test@example.com' into the email field",
            "Type 'test@example.com' into the email field",
        )
        await act_with_cache(
            session,
            "Type '4242424242424242' into the card number field",
            "Type '4242424242424242' into the card number field",
        )
        await act_with_cache(
            session,
            "Type '12/34' into the expiration date field",
            "Type '12/34' into the expiration date field",
        )

        elapsed = f"{(asyncio.get_event_loop().time() - start_time):.2f}"
        cache_exists = CACHE_FILE.exists()

        if cache_exists:
            async with aiofiles.open(CACHE_FILE) as f:
                cache_content = await f.read()
                cache_data = json.loads(cache_content)
                cache_count = len(cache_data)
        else:
            cache_count = 0

        print(f"\nTotal time: {elapsed}s")

        if cache_count >= 4:
            print("Cost: $0.00 (cache hits, no LLM calls)")
            print("API calls: 0 (all from cache)")
            print(f"Cache entries: {cache_count}")
        else:
            print("Cost: ~$0.01-0.05 (first run, populated cache)")
            print("API calls: 4 (saved to cache for next run)")
            print("Cache created")
        print()

        return {"elapsed": elapsed, "llm_calls": 0 if cache_count >= 4 else 4}

    finally:
        await session.end()


async def main():
    print("\n" + "=" * 60)
    print("  Caching Demo - Run This Script TWICE!")
    print("=" * 60 + "\n")

    print("This demo shows caching impact by running the same workflow twice:\n")
    print("First run:")
    print("  1. WITHOUT cache (baseline)")
    print("  2. WITH cache enabled (populates cache)\n")

    print("Second run:")
    print("  - WITH cache (instant, $0 cost)\n")

    print("Run 'python main.py' twice to see the difference!\n")

    cache_exists = CACHE_FILE.exists()

    if cache_exists:
        async with aiofiles.open(CACHE_FILE) as f:
            cache_content = await f.read()
            cache_data = json.loads(cache_content)
            cache_count = len(cache_data)
        print(f"Cache found: {cache_count} entries")
        print("   This is a SUBSEQUENT run - cache will be used!\n")
    else:
        print("No cache found - first run will populate cache")

    print("\nRunning comparison: without cache vs with cache...\n")

    without_cache = await run_without_cache()
    with_cache = await run_with_cache()

    print("\n=== Comparison ===")
    print(f"Without caching: {without_cache['elapsed']}s, {without_cache['llm_calls']} LLM calls")
    print(f"With caching:    {with_cache['elapsed']}s, {with_cache['llm_calls']} LLM calls")

    if with_cache["llm_calls"] == 0:
        speedup = float(without_cache["elapsed"]) / float(with_cache["elapsed"])
        print(f"\nSpeedup: {speedup:.1f}x faster with cache")
        print("Cost savings: 100% (no LLM calls)")

    print("\nRun again to see cache benefits on subsequent runs!")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Error in caching demo: {err}")
        print("Common issues:")
        print("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY")
        print("  - Verify MODEL_API_KEY is set for the model")
        exit(1)
