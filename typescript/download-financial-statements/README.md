# Stagehand + Browserbase: Download Apple's Quarterly Financial Statements

## AT A GLANCE

- Goal: automate downloading Apple's quarterly financial statements (PDFs) from their investor relations site.
- Download Handling: Browserbase automatically captures PDFs opened during the session and bundles them into a ZIP file.
- Retry Logic: polls Browserbase downloads API with configurable timeout to ensure files are ready before retrieval.
- Live Debugging: the session can be monitored from the Browserbase Sessions dashboard without logging a signed URL.

## GLOSSARY

- page APIs: use the V4 browser context and page directly for known navigation and link discovery
  Docs → https://docs.stagehand.dev/v4/reference/page
- downloads API: retrieve files downloaded during a Browserbase session as a ZIP archive
  Docs → https://docs.browserbase.com/features/screenshots#pdfs
- live view: real-time browser debugging interface for monitoring automation
  Docs → https://docs.browserbase.com/features/session-live-view

## QUICKSTART

1.  cd download-financial-statements
2.  npm install
3.  cp .env.example .env
4.  Add your Browserbase API key to .env
5.  npm start

## EXPECTED OUTPUT

- Initializes Stagehand session with Browserbase
- Navigates directly to Apple Investor Relations
- Discovers and validates four unique FY2025 Financial Statements PDF URLs
- Opens each statement to trigger Browserbase downloads
- Polls Browserbase API until downloads are ready
- Saves all PDFs as `downloaded_files.zip` in current directory
- Displays Stagehand metrics and closes cleanly

## COMMON PITFALLS

- "Cannot find module": ensure all dependencies are installed
- Missing credentials: verify .env contains BROWSERBASE_API_KEY
- Download timeout: increase `retryForSeconds` parameter if downloads take longer than 45 seconds
- Empty ZIP file: ensure PDFs were actually triggered (inspect the session in the Browserbase dashboard)
- Network issues: check internet connection and Apple website accessibility

## USE CASES

• Financial reporting automation: Download quarterly/annual reports from investor relations sites for analysis, archiving, or compliance.
• Document batch retrieval: Collect multiple PDFs (contracts, invoices, statements) from web portals without manual clicking.
• Scheduled data collection: Run on cron/Lambda to automatically fetch latest financial filings or regulatory documents.

## NEXT STEPS

• Generalize for other sites: Adapt URL/link matching and support multiple companies or document types.
• Parse downloaded PDFs: Unzip, OCR/parse text (PyPDF2/pdfplumber), and load into structured format (CSV/DB/JSON).
• Add validation: Check file count, sizes, naming conventions; alert on failures; retry missing quarters.

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev/v4/first-steps/introduction
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
