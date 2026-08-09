# Stagehand + Browserbase: Company Address Finder

## AT A GLANCE

- Goal: Automate discovery of company legal information and physical addresses from Terms of Service and Privacy Policy pages.
- V4 Workflow: Uses explicit Google navigation plus Stagehand `act()` and `extract()` calls.
- Data Extraction: Extracts structured data including homepage URLs, ToS/Privacy Policy links, and physical mailing addresses.
- Fallback Strategy: Intelligently falls back from Terms of Service to Privacy Policy if address is not found.
- Retry Logic: Built-in exponential backoff for reliability against network failures.
- Scalable: Supports both sequential and concurrent processing (concurrent requires Startup/Developer plan or higher).

## GLOSSARY

- act: perform one model-backed browser action from a natural-language instruction
  Docs → https://docs.stagehand.dev/v4/basics/act
- extract: pull structured data from web pages using natural language instructions and Zod schemas
  Docs → https://docs.stagehand.dev/basics/extract
- concurrent sessions: run multiple browser sessions simultaneously for faster batch processing
  Docs → https://docs.browserbase.com/guides/concurrency-rate-limits
- exponential backoff: retry strategy that increases wait time between attempts for reliability

## QUICKSTART

1. cd company-address-finder
2. pnpm install
3. cp .env.example .env
4. Add your Browserbase API key to `.env`
5. Edit COMPANY_NAMES array in index.ts to specify which companies to process
6. pnpm start

## EXPECTED OUTPUT

- Initializes a V4 browser and Stagehand client for each company
- Application code searches Google and opens the official company homepage
- Extracts Terms of Service and Privacy Policy links from homepage
- Navigates to Terms of Service and extracts physical address
- Falls back to Privacy Policy if address not found in ToS
- Outputs comprehensive JSON with all extracted data for each company
- Displays processing status and session closure for each company

## COMMON PITFALLS

- Missing credentials: verify `.env` contains `BROWSERBASE_API_KEY`
- Concurrent processing: MAX_CONCURRENT > 1 requires Browserbase Startup or Developer plan or higher (default is 1 for sequential)
- Company not found: the official-result action may fail if the name is ambiguous
- Address extraction: some companies may not list physical addresses in their legal documents
- Session timeouts: long-running batches may hit 900s timeout (adjust browserbaseSessionCreateParams if needed)

## USE CASES

• Legal compliance research: Collect company addresses and legal document URLs for due diligence, vendor verification, or compliance audits.
• Business intelligence: Build datasets of company locations and legal information for market research or competitive analysis.
• Contact data enrichment: Augment CRM or database records with verified physical addresses extracted from official company documents.
• Multi-company batch processing: Process lists of companies (investors, partners, clients) to gather standardized location data at scale.

## NEXT STEPS

• Parameterize inputs: Accept company names from CSV files, command-line arguments, or API endpoints for dynamic batch processing.
• Expand extraction: Add support for additional fields like contact emails, phone numbers, business registration numbers, or founding dates.
• Multi-source validation: Cross-reference addresses from multiple pages (About, Contact, Footer) to improve accuracy and confidence.
• Export formats: Add CSV, Excel, or database export options with configurable field mappings for downstream integrations.
• Error handling: Implement more granular error categorization (not found vs. no address vs. extraction failure) for better reporting.

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev/v4/first-steps/introduction
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
