# Stagehand + Browserbase: Restaurant Menu Extractor - Scraping Logic
# See README.md for full documentation

"""Core scraping logic for restaurant menu extraction."""

import time
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from playwright.sync_api import sync_playwright, Page
from stagehand import Stagehand
from config import (
    BROWSERBASE_API_KEY,
    BROWSERBASE_PROJECT_ID,
    MODEL_API_KEY,
    NO_MENU_LINK_FOUND,
    MAX_RETRIES,
    bb,
    logger
)
from models import MENU_SCHEMA
from utils import save_menu_to_json


def close_popups(client: Stagehand, session_id: str, log: logging.Logger = logger) -> bool:
    """
    Attempt to close popups/modals that might be blocking the page.

    Args:
        client: Stagehand client instance
        session_id: Active session ID
        log: Logger instance

    Returns:
        True if popups were closed, False otherwise
    """
    try:
        client.sessions.act(
            id=session_id,
            input="Close any popups, modals, or cookie notices that are blocking the page",
        )
        log.info("Successfully closed popups/modals")
        return True
    except Exception as e:
        log.debug(f"No popups to close or failed to close: {e}")
        return False


def find_menu_link(client: Stagehand, session_id: str, max_retries: int = MAX_RETRIES):
    """
    Attempt to locate the restaurant's menu link using Stagehand observe.
    Retries up to max_retries times if it fails.

    Args:
        client: Stagehand client instance
        session_id: Active session ID
        max_retries: Maximum number of retry attempts

    Returns:
        Menu link result or NO_MENU_LINK_FOUND
    """
    instruction = (
        "Find the most likely link to the restaurant's menu on this webpage. If the webpage "
        "already is the menu page, return the current page URL. Return only the link URL."
    )

    for attempt in range(1, max_retries + 1):
        try:
            response = client.sessions.observe(
                id=session_id,
                instruction=instruction,
            )
            return response.data.result
        except Exception as e:
            logger.warning(f"[Attempt {attempt}] Failed: {e}")
            time.sleep(1)
    return NO_MENU_LINK_FOUND


def extract_menu_from_sections(
    client: Stagehand,
    session_id: str,
    page: Page,
    sections: List[Any]
) -> List[Dict[str, Any]]:
    """
    Extract menu data from all sections.

    Args:
        client: Stagehand client instance
        session_id: Active session ID
        page: Playwright page instance
        sections: List of menu sections to extract

    Returns:
        List of all extracted menu sections
    """
    all_menu_sections = []

    for section in sections:
        section_desc = section.get("description", "") if isinstance(section, dict) else str(section)
        logger.info(f"Navigating to menu section: {section_desc} ...")

        # Skip iframe links
        if "iframe" in section_desc.lower():
            logger.info("Skipping iframe link ...")
            continue

        # Navigate to section
        client.sessions.act(
            id=session_id,
            input=f"Navigate to: {section_desc}",
        )

        page.wait_for_load_state("load", timeout=20000)

        # Extract menu data
        extract_response = client.sessions.extract(
            id=session_id,
            instruction="Extract the menu organized by sections and categories. "
                       "Each section contains categories, and each category contains menu items. "
                       "For each item, extract the name, description, and price. "
                       "Preserve price formatting exactly as written.",
            schema=MENU_SCHEMA,
        )
        logger.info(f"Menu data extracted for {section_desc}")

        # Collect the extracted menu data
        menu_data = extract_response.data.result
        if menu_data and "sections" in menu_data:
            all_menu_sections.extend(menu_data["sections"])

    return all_menu_sections


def process_restaurant(website_url: str, agent_id: int) -> Dict[str, Any]:
    """
    Web agent that processes a single restaurant website.
    This represents a single subprocessor in a production pipeline.

    Args:
        website_url: The restaurant website to scrape
        agent_id: Unique identifier for this agent instance

    Returns:
        Dictionary containing extraction results and metadata
    """
    agent_logger = logging.getLogger(f"Agent-{agent_id}")
    start_time = datetime.now()

    result = {
        "agent_id": agent_id,
        "url": website_url,
        "status": "pending",
        "start_time": start_time.isoformat(),
        "menu_data": [],
        "error": None,
    }

    # Create Browserbase session
    session = bb.sessions.create(project_id=BROWSERBASE_PROJECT_ID)
    session_id = session.id

    # Initialize Stagehand client
    client = Stagehand(
        browserbase_api_key=BROWSERBASE_API_KEY,
        browserbase_project_id=BROWSERBASE_PROJECT_ID,
        model_api_key=MODEL_API_KEY,
    )

    agent_logger.info(f"Session started: {session_id}")
    agent_logger.info(f"Watch live: https://browserbase.com/sessions/{session_id}")

    try:
        # Connect Playwright to Browserbase
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(
                f"wss://connect.browserbase.com?apiKey={BROWSERBASE_API_KEY}&sessionId={session_id}"
            )
            ctx = browser.contexts[0]
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

            # Navigate to website
            agent_logger.info(f"Navigating to {website_url}")
            page.goto(website_url, wait_until="domcontentloaded")

            # Close any popups on initial page load
            close_popups(client, session_id, agent_logger)

            # Extract menu data
            all_menu_sections = []
            menu_link = find_menu_link(client, session_id)
            if menu_link == NO_MENU_LINK_FOUND:
                agent_logger.warning("Could not find menu link")
            else:
                agent_logger.info(f"Menu link: {menu_link}")

                # Navigate to menu link
                client.sessions.act(
                    id=session_id,
                    input=f"Click on: {menu_link[0] if isinstance(menu_link, list) else menu_link}",
                )

                page.wait_for_load_state("load", timeout=20000)

                # Close any popups after navigating to menu page
                close_popups(client, session_id, agent_logger)

                # Extract menu sections
                sections_response = client.sessions.observe(
                    id=session_id,
                    instruction="Find all subsections on the current menu page, i.e. 'Lunch', 'Dinner', 'Happy Hour', etc. "
                               "Return them as a list of links. If none found, return the current page link only in a list. "
                               "Do not return duplicates if a link appears multiple times.",
                )
                sections = sections_response.data.result

                # Extract menu from all sections
                all_menu_sections = extract_menu_from_sections(client, session_id, page, sections)

            browser.close()

        result["status"] = "success"
        end_time = datetime.now()
        result["end_time"] = end_time.isoformat()
        result["duration_seconds"] = (end_time - start_time).total_seconds()
        agent_logger.info(f"Completed extraction in {result['duration_seconds']:.2f}s")

        # Save combined menu data to JSON file
        if all_menu_sections:
            save_menu_to_json(
                website_url,
                all_menu_sections,
                agent_id=agent_id,
                duration_seconds=result["duration_seconds"]
            )

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
        agent_logger.error(f"Error processing {website_url}: {e}", exc_info=True)

    finally:
        # End session
        try:
            client.sessions.end(id=session_id)
            agent_logger.info("Session closed successfully")
        except Exception as e:
            agent_logger.error(f"Error closing session: {e}")

    return result
