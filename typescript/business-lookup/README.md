# Stagehand V4 + Browserbase: Business Lookup

## AT A GLANCE

- Goal: automate business registry searches with explicit Stagehand V4 actions.
- Uses individual `act()` calls to apply filters and open details, then `extract()` for structured data.
- Demonstrates extraction with Zod schema validation for consistent data retrieval.
- Docs → https://docs.stagehand.dev/v4/basics/act

## GLOSSARY

- act: perform one model-backed action from a natural-language instruction
  Docs → https://docs.stagehand.dev/v4/basics/act
- extract: extract structured data from web pages using natural language instructions
  Docs → https://docs.stagehand.dev/basics/extract

## QUICKSTART

1. pnpm install
2. cp .env.example .env
3. Add required API keys/IDs to .env
4. pnpm start

## EXPECTED OUTPUT

- Initializes Stagehand session with Browserbase
- Navigates to SF Business Registry search page
- Explicit actions search by DBA Name and open business details
- Extracts structured business information (DBA Name, Account Number, NAICS Code, etc.)
- Outputs extracted data as JSON
- Closes session cleanly

## COMMON PITFALLS

- Dependency install errors: ensure npm install completed
- Missing credentials: verify `.env` contains `BROWSERBASE_API_KEY`
- Action failures: check that the business exists and make the failing instruction more specific
- Find more information on your Browserbase dashboard -> https://www.browserbase.com/sign-in

## USE CASES

• Business verification: Automate registration status checks, license validation, and compliance verification for multiple businesses.
• Data enrichment: Collect structured business metadata (NAICS codes, addresses, ownership) for research or CRM updates.
• Due diligence: Streamline background checks by autonomously searching and extracting business registration details from public registries.

## NEXT STEPS

• Parameterize search: Accept business names as command-line arguments or from a CSV file for batch processing.
• Expand extraction: Add support for additional fields like tax status, licenses, or historical registration changes.
• Multi-registry support: Extend agent to search across multiple city or state business registries with routing logic.

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev/v4/first-steps/introduction
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
