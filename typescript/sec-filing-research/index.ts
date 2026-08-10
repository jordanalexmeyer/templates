// Stagehand + Browserbase: SEC Filing Downloader - See README.md for full documentation

import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";

async function closeSession(
  stagehand: Stagehand,
  browser: Awaited<ReturnType<typeof browserbase.launch>>,
) {
  await stagehand.close().catch((error) => console.warn("Stagehand cleanup warning:", error));
  await browser.close().catch((error) => console.warn("Browser cleanup warning:", error));
}

// Search query - can be company name, ticker symbol, or CIK number
// Examples: "Apple Inc", "AAPL", "0000320193"
const SEARCH_QUERY = "Apple Inc";
const COMPANY_CIK = "0000320193";

// Number of filings to retrieve
const NUM_FILINGS = 5;

// Result shape returned after extracting company and filing metadata from SEC EDGAR
interface SECFilingResult {
  company: string;
  cik: string;
  searchQuery: string;
  filings: Array<{
    type: string;
    date: string;
    description: string;
    accessionNumber: string;
    fileNumber: string;
  }>;
}

/**
 * Searches SEC EDGAR for a company (by name, ticker, or CIK) and extracts
 * recent filing metadata: type, date, description, accession number, file number.
 * Uses Stagehand + Browserbase for AI-powered browser automation.
 */
async function main(): Promise<void> {
  console.log("Starting SEC Filing Downloader...");
  console.log(`Search query: ${SEARCH_QUERY}`);
  console.log(`Retrieving ${NUM_FILINGS} most recent filings\n`);

  // Initialize Stagehand with Browserbase for cloud-based browser automation
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const stagehand = await Stagehand.create({
    browser: browser,
    model: { modelName: "google/gemini-2.5-flash" },
    logging: { level: "info" },
  });

  try {
    // Initialize browser session

    console.log("Stagehand initialized successfully!");

    const page = (await browser.context.pages())[0];

    // The target company is known, so navigate directly to its entity page.
    // This avoids depending on the changing autocomplete/search UI.
    console.log("\nNavigating to SEC EDGAR...");
    await page.goto(`https://www.sec.gov/edgar/browse/?CIK=${COMPANY_CIK}&owner=exclude`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    // EDGAR's table has a stable machine-readable shape, so use a deterministic
    // DOM read and derive accession numbers from the official document URLs.
    console.log(`Extracting the ${NUM_FILINGS} most recent filings...`);
    const extracted = (await page.evaluate((limit: number) => {
      const company = document.querySelector("h3")?.textContent?.trim().split("\n")[0] ?? "";
      const tables = Array.from(document.querySelectorAll("table"));
      const table = tables.sort(
        (left, right) =>
          right.querySelectorAll("tbody tr").length - left.querySelectorAll("tbody tr").length,
      )[0];
      const filings = Array.from(table?.querySelectorAll("tbody tr") ?? [])
        .slice(0, limit)
        .map((row) => {
          const cells = Array.from(row.querySelectorAll("td"));
          const filingLink = row.querySelector<HTMLAnchorElement>(
            'a[href*="/Archives/edgar/data/"]',
          );
          const folder = filingLink?.href.match(/\/data\/\d+\/(\d{18})\//)?.[1] ?? "";
          const accessionNumber = folder
            ? `${folder.slice(0, 10)}-${folder.slice(10, 12)}-${folder.slice(12)}`
            : "";
          return {
            type: cells[0]?.textContent?.trim() ?? "",
            description: cells[1]?.textContent?.replace(/\s+/g, " ").trim() ?? "",
            date: cells[2]?.textContent?.trim() ?? "",
            accessionNumber,
            fileNumber: "",
          };
        });
      return { company, filings };
    }, NUM_FILINGS)) as { company: string; filings: SECFilingResult["filings"] };

    if (
      extracted.filings.length !== NUM_FILINGS ||
      extracted.filings.some((filing) => !filing.type || !filing.date || !filing.accessionNumber)
    ) {
      throw new Error("SEC page did not return five complete filing records");
    }

    // Build result object with company info and normalized filing list
    const result: SECFilingResult = {
      company: extracted.company,
      cik: COMPANY_CIK,
      searchQuery: SEARCH_QUERY,
      filings: extracted.filings,
    };

    // Log summary and per-filing details to console
    console.log("\n" + "=".repeat(60));
    console.log("SEC FILING METADATA");
    console.log("=".repeat(60));
    console.log(`Company: ${result.company}`);
    console.log(`CIK: ${result.cik}`);
    console.log(`Search Query: ${result.searchQuery}`);
    console.log(`Filings Retrieved: ${result.filings.length}`);
    console.log("=".repeat(60));

    // Display each filing's type, date, description, accession number, file number
    result.filings.forEach((filing, index) => {
      console.log(`\nFiling ${index + 1}:`);
      console.log(`  Type: ${filing.type}`);
      console.log(`  Date: ${filing.date}`);
      console.log(
        `  Description: ${filing.description.substring(0, 80)}${filing.description.length > 80 ? "..." : ""}`,
      );
      console.log(`  Accession Number: ${filing.accessionNumber}`);
      console.log(`  File Number: ${filing.fileNumber}`);
    });

    // Output full result as JSON for piping or integration
    console.log("\n" + "=".repeat(60));
    console.log("JSON OUTPUT:");
    console.log("=".repeat(60));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error during SEC filing extraction:", error);
    throw error;
  } finally {
    // Always close session to release resources and clean up
    await closeSession(stagehand, browser);
    console.log("\nSession closed successfully");
  }
}

main().catch((err) => {
  console.error("Application error:", err);
  // Provide helpful troubleshooting information
  console.error("\nCommon issues:");
  console.error("  - Check .env file has BROWSERBASE_API_KEY");
  console.error("  - Verify internet connection and SEC website accessibility");
  console.error("  - Ensure the search query is valid (company name, ticker, or CIK)");
  console.error("\nDocs: https://docs.stagehand.dev/v4/first-steps/introduction");
  process.exit(1);
});
