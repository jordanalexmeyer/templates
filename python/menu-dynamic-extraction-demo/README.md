# Stagehand + Browserbase: Restaurant Menu Extractor

## AT A GLANCE

- **Goal**: Automate restaurant menu extraction from websites using AI-powered browser automation to scrape menu items, prices, descriptions, and categories.
- **Pattern Template**: Demonstrates web scraping with Stagehand's observe/act/extract pattern for navigating complex restaurant websites and parsing menu structures.
- **Workflow**: Stagehand navigates to restaurant website, finds menu links using observe, extracts structured data with Pydantic schemas, handles multi-section menus (lunch/dinner/drinks), and outputs JSON results.
- **Multi-Section Support**: Automatically detects menu subsections (Lunch, Dinner, Happy Hour, etc.) and extracts each separately for comprehensive coverage.
- **Production-Ready**: Includes retry logic, popup handling, logging, error recovery, and parallel processing capabilities for batch extraction.
- Docs → [Stagehand Act](https://docs.stagehand.dev/basics/act) | [Stagehand Observe](https://docs.stagehand.dev/basics/observe) | [Stagehand Extract](https://docs.stagehand.dev/basics/extract)

## GLOSSARY

- **observe**: Find and return interactive elements on the page matching a description without performing actions. Used here to locate menu links and subsections.
  Docs → https://docs.stagehand.dev/basics/observe
- **act**: Perform UI actions from natural language prompts (click buttons, navigate links). Used to click menu links discovered via observe.
  Docs → https://docs.stagehand.dev/basics/act
- **extract**: Pull structured data from web pages using natural language instructions and Pydantic schemas. Ensures menu data is consistently formatted.
  Docs → https://docs.stagehand.dev/basics/extract
- **Pydantic schemas**: Type-safe data models that define the structure of extracted menu data (sections, categories, items, prices).
  Docs → https://docs.pydantic.dev/
- **BYOB (Bring Your Own Browser)**: Run Stagehand sessions on Browserbase's cloud infrastructure for reliability, scalability, and live debugging.
  Docs → https://docs.browserbase.com

## QUICKSTART

1. cd python/restaurant-demo
2. Install dependencies with uv:

   ```bash
   uv pip install -e .
   ```

   Alternatively, use pip:

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -e .
   ```

3. cp .env.example .env
4. Add required API keys to .env:
   - `BROWSERBASE_PROJECT_ID` - Get from https://www.browserbase.com/settings
   - `BROWSERBASE_API_KEY` - Get from https://www.browserbase.com/settings
   - `GOOGLE_API_KEY` - Get from https://aistudio.google.com/apikey
5. Run the script:
   ```bash
   python main.py
   ```
   The script will prompt you for a restaurant website URL.

## EXPECTED OUTPUT

- Prompts for restaurant website URL input
- Initializes Stagehand session with Browserbase (verbose logging shows browser actions)
- Navigates to the restaurant website and attempts to close any popups/modals
- Uses observe to find the menu link (retries up to 3 times if needed)
- Clicks the menu link and navigates to menu page
- Detects all menu subsections (Lunch, Dinner, Drinks, etc.) via observe
- For each subsection:
  - Navigates to that section
  - Extracts structured menu data: sections → categories → items (name, description, price)
- All extraction results are stored in the Stagehand session (can be extended to write JSON files)
- Session closes cleanly after extraction completes

Example log output:
```
INFO: Navigating to https://example-restaurant.com ...
INFO: Menu link found: ['https://example-restaurant.com/menu']
INFO: Navigating to menu section: Lunch Menu ...
INFO: Extracting menu section: Lunch Menu
INFO: Navigating to menu section: Dinner Menu ...
INFO: Session closed successfully
```

## COMMON PITFALLS

- "ModuleNotFoundError: No module named 'stagehand'": Ensure you installed dependencies with `uv pip install -e .` or `pip install -e .`
- Missing API keys: Verify .env contains BROWSERBASE_PROJECT_ID, BROWSERBASE_API_KEY, and GOOGLE_API_KEY
- "Could not find menu link after multiple attempts": The restaurant website may have an unusual structure. Try manually checking if there's a clear "Menu" link. Increase MAX_RETRIES in config if needed.
- Popup/modal blocking: The script attempts to close popups automatically, but some sites have persistent overlays. Check the Browserbase live view link to debug.
- Empty extraction results: Some restaurant sites load menus dynamically or via iframes. The script skips iframe links automatically but may need manual adjustment for special cases.
- Stagehand verbose=2 logging: Produces detailed output for debugging. Set LOG_LEVEL=WARNING in .env for quieter output.
- Find more information on your Browserbase dashboard → https://www.browserbase.com/sign-in

## USE CASES

• **Restaurant data aggregation**: Build a database of restaurant menus across multiple locations for food delivery or review platforms.
• **Menu price comparison**: Track menu prices over time to detect price changes or compare pricing across restaurant chains.
• **Dietary restriction filtering**: Extract menu items and descriptions to identify vegan, gluten-free, or allergen-friendly options automatically.
• **Recipe inspiration**: Collect menu descriptions to analyze trending ingredients, flavor combinations, or plating techniques.

## LIMITATIONS
• **PDF menu support**: Some restaurants use PDF menus. Enhance extraction to handle PDF downloads and OCR if needed.

## NEXT STEPS

• **Batch processing**: Modify to accept a list of restaurant URLs from a file and process them in parallel using asyncio workers (see scraper.py for agent pattern).
• **Output to database**: Extend the script to save extracted menus to PostgreSQL, MongoDB, or Airtable for persistent storage and querying.
• **Restaurant info extraction**: Expand to extract contact details (phone, email, hours, address) in addition to menu data.
• **Incremental updates**: Track previously extracted menus and only re-scrape when website content has changed (use checksums or last-modified headers).

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev/v3/first-steps/introduction
📚 Python SDK: https://docs.stagehand.dev/v3/sdk/python
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
