# Stagehand + Browserbase: SEC Filing Research

## AT A GLANCE

- Goal: automate searching SEC EDGAR for a company and extracting recent filing metadata (type, date, description, accession number, file number).
- Entity selection: uses Apple's known CIK by default; edit `SEARCH_QUERY` and `COMPANY_CIK` together for another company.
- Data extraction: navigates directly to the official EDGAR entity page and reads its stable filing table with V4 page APIs.
- Output: company name, CIK, and a configurable number of most recent filings, printed as summary and JSON.

## GLOSSARY

- page APIs: use the V4 browser context and page directly for stable, machine-readable tables.
  Docs → https://docs.stagehand.dev/v4/reference/page
- SEC EDGAR: SEC’s company and filing search and filing system.
  https://www.sec.gov/edgar/searchedgar/companysearch.html
- CIK: Central Index Key — unique numeric identifier for each company in EDGAR.

## QUICKSTART

1. cd sec-filing-research
2. npm install
3. cp .env.example .env
4. Add BROWSERBASE_API_KEY to .env
5. (Optional) Edit SEARCH_QUERY, COMPANY_CIK, and NUM_FILINGS in index.ts
6. npm start

## EXPECTED OUTPUT

- Initializes Stagehand V4 with an explicit Browserbase browser handle
- Navigates directly to the configured SEC EDGAR entity page
- Reads the official filing table and derives accession numbers from document URLs
- Extracts the N most recent filings (type, date, description, accession number, file number)
- Logs SEC FILING METADATA summary and per-filing details
- Outputs full result as JSON
- Closes session cleanly

## COMMON PITFALLS

- "Cannot find module": run npm install in sec-filing-research
- Missing credentials: ensure .env has BROWSERBASE_API_KEY
- Wrong company: update `SEARCH_QUERY` and `COMPANY_CIK` together
- Extraction errors: SEC page layout changes can require table-selector updates
- Rate limiting: avoid excessive runs; SEC may throttle heavy or automated traffic

## USE CASES

• Compliance and due diligence: quickly pull recent 10-K, 10-Q, 8-K metadata for a list of companies.
• Research pipelines: feed accession numbers into downstream tools to fetch full filings or parse specific sections.
• Monitoring: periodically extract latest filings for watchlists and alert on new filings.
• Data enrichment: attach official company name and CIK to internal records using SEC as source of truth.

## NEXT STEPS

• Parameterize search: read SEARCH_QUERY, COMPANY_CIK, and NUM_FILINGS from env or CLI for batch runs.
• Fetch full filings: use accession numbers with SEC’s full-text filing URLs or APIs to download documents.
• Multiple companies: loop over a list of tickers/names and aggregate results into a single report or JSON.
• Filter by type: restrict to 10-K/10-Q/8-K or other form types in post-processing.

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev/v4/first-steps/introduction
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
