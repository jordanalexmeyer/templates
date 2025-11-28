// Stagehand + Browserbase: Website Link Tester - See README.md for full documentation

import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";

// Base URL whose links we want to crawl and verify
const URL = "https://www.browserbase.com";

// Maximum number of links to verify concurrently.
// Default: 1 (sequential processing - works on all plans)
// Set to > 1 for more concurrent link verification (requires Startup or Developer plan or higher).
// For more advanced concurrency control (rate limiting, prioritization, per-domain caps),
// you can also wrap link verification in a Semaphore or similar concurrency primitive.
const MAX_CONCURRENT_LINKS = 1;

// Shape of a single hyperlink extracted from the page
type Link = {
  url: string;
  linkText: string;
};

// Result of checking a single link, including any verification metadata
type LinkCheckResult = {
  linkText: string;
  url: string;
  success: boolean;
  pageTitle?: string;
  contentMatches?: boolean;
  assessment?: string;
  error?: string;
};

// Domains that are treated as social links; we only check that they load,
// and skip content verification because they often require auth/consent flows.
const SOCIAL_DOMAINS = [
  "twitter.com",
  "x.com",
  "facebook.com",
  "linkedin.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "reddit.com",
  "discord.com",
];

// Creates a preconfigured Stagehand instance for Browserbase sessions
function createStagehand() {
  return new Stagehand({
    env: "BROWSERBASE",
    verbose: 0,
    model: "google/gemini-2.5-pro",
  });
}

// Removes duplicate links by URL while preserving the first occurrence
function deduplicateLinks(extractedLinks: { links: Link[] }): Link[] {
  const map = new Map<string, Link>();

  for (const link of extractedLinks.links) {
    if (!map.has(link.url)) {
      map.set(link.url, link);
    }
  }

  return Array.from(map.values());
}

/**
 * Opens the homepage and uses Stagehand `extract()` to collect all links.
 * Returns a de-duplicated array of link objects that we will later verify.
 */
async function collectLinksFromHomepage(): Promise<Link[]> {
  const stagehand = createStagehand();

  try {
    // Start a fresh browser session for link collection
    await stagehand.init();

    console.log(
      `Watch live: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`,
    );

    const page = stagehand.context.pages()[0];

    // Navigate to the base URL where we will harvest links
    console.log(`Navigating to ${URL}...`);
    await page.goto(URL);

    console.log(`Successfully loaded ${URL}. Extracting links...`);

    const extractedLinks = await stagehand.extract(
      "extract all links on the page with their link text",
      z.object({
        links: z.array(
          z.object({
            url: z.string().url(),
            linkText: z.string(),
          }),
        ),
      }),
    );

    // Remove duplicate URLs and log both raw and unique counts for visibility
    const uniqueLinks = deduplicateLinks(extractedLinks);

    console.log(
      `All links on the page (${extractedLinks.links.length} total, ${uniqueLinks.length} unique):`,
    );
    console.log(JSON.stringify({ links: uniqueLinks }, null, 2));

    console.log("\nClosing initial browser...");
    await stagehand.close();
    console.log("Initial browser closed");

    return uniqueLinks;
  } catch (error) {
    console.error("Error while collecting links:", error);
    // Ensure the browser is closed even when link collection fails
    await stagehand.close();
    throw error;
  }
}

/**
 * Verifies a single link by opening it in a dedicated browser session.
 * - Confirms the page loads successfully.
 * - For non-social links, uses `extract()` to check that the page content
 *   matches what the link text suggests.
 */
async function verifySingleLink(link: Link): Promise<LinkCheckResult> {
  console.log(`\nChecking: ${link.linkText} (${link.url})`);

  let browser: Stagehand | null = null;

  try {
    browser = createStagehand();
    await browser.init();

    const page = browser.context.pages()[0];

    // Detect if this is a social link (we treat those differently)
    const isSocialLink = SOCIAL_DOMAINS.some((domain) =>
      link.url.includes(domain)
    );

    await page.goto(link.url, { timeoutMs: 30000 });
    await page.waitForLoadState("domcontentloaded");

    const currentUrl = page.url();

    // Guard against pages that never load or redirect to an invalid URL
    if (!currentUrl || currentUrl === "about:blank") {
      throw new Error("Page failed to load - invalid URL detected");
    }

    console.log(`Link opened successfully: ${link.linkText}`);

    // For social links, we consider a successful load good enough
    if (isSocialLink) {
      console.log(
        `[${link.linkText}] Social media link - skipping content verification`,
      );

      return {
        linkText: link.linkText,
        url: link.url,
        success: true,
        pageTitle: "Social Media Link",
        contentMatches: true,
        assessment:
          "Social media link loaded successfully (content verification skipped)",
      };
    }

    // Ask the model to read the page and decide whether it matches the link text
    const verification = await browser.extract(
      `Does the page content match what the link text "${link.linkText}" suggests? Extract the page title and provide a brief assessment (maximum 8 words).`,
      z.object({
        pageTitle: z.string(),
        contentMatches: z.boolean(),
        assessment: z.string(),
      }),
    );

    console.log(`[${link.linkText}] Page Title: ${verification.pageTitle}`);
    console.log(
      `[${link.linkText}] Content Matches: ${
        verification.contentMatches ? "YES" : "NO"
      }`,
    );
    console.log(`[${link.linkText}] Assessment: ${verification.assessment}`);

    return {
      linkText: link.linkText,
      url: link.url,
      success: true,
      pageTitle: verification.pageTitle,
      contentMatches: verification.contentMatches,
      assessment: verification.assessment,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(
      `Failed to verify link "${link.linkText}": ${errorMessage}`,
    );

    // On failure, return a structured result capturing the error message
    return {
      linkText: link.linkText,
      url: link.url,
      success: false,
      error: errorMessage,
    };
  } finally {
    if (browser) {
      // Always close the browser to free resources, even on error
      await browser.close();
      console.log(`Browser closed for: ${link.linkText}`);
    }
  }
}

/**
 * Verifies all links in batches to avoid opening too many concurrent sessions.
 * Returns an array of `LinkCheckResult` objects for all processed links.
 */
async function verifyLinksInBatches(links: Link[]): Promise<LinkCheckResult[]> {
  console.log(`\nVerifying links in batches of ${MAX_CONCURRENT_LINKS}...`);

  const results: LinkCheckResult[] = [];

  for (let i = 0; i < links.length; i += MAX_CONCURRENT_LINKS) {
    const batch = links.slice(i, i + MAX_CONCURRENT_LINKS);

    console.log(
      `\n=== Processing batch ${Math.floor(i / MAX_CONCURRENT_LINKS) + 1} (${batch.length} links) ===`,
    );

    const batchResults = await Promise.all(
      batch.map((link) => verifySingleLink(link)),
    );

    results.push(...batchResults);

    console.log(
      `\nBatch ${Math.floor(i / MAX_CONCURRENT_LINKS) + 1} complete (${results.length} total verified)`,
    );
  }

  return results;
}

/**
 * Logs a JSON summary of all link verification results.
 * Falls back to a brief textual summary if JSON stringification fails.
 */
function outputResults(results: LinkCheckResult[], label: string = "FINAL RESULTS") {
  console.log("\n" + "=".repeat(80));
  console.log(label);
  console.log("=".repeat(80));
  
  const finalReport = {
    totalLinks: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
  
  try {
    console.log(JSON.stringify(finalReport, null, 2));
  } catch (stringifyError) {
    console.error("Error stringifying results:", stringifyError);
    console.log("Summary only:");
    console.log(`Total: ${finalReport.totalLinks}`);
    console.log(`Successful: ${finalReport.successful}`);
    console.log(`Failed: ${finalReport.failed}`);
  }
  
  console.log("\n" + "=".repeat(80));
}

/**
 * Orchestrates the full flow:
 * 1. Collect all links from the homepage.
 * 2. Verify them in batches.
 * 3. Print a final JSON report (or partial results if an error occurs).
 */
async function main() {
  console.log("Starting main function...");
  
  let results: LinkCheckResult[] = [];
  
  try {
    const links = await collectLinksFromHomepage();
    console.log(`Collected ${links.length} links, starting verification...`);

    results = await verifyLinksInBatches(links);
    
    console.log("\n✓ All links verified!");
    console.log(`Results array length: ${results.length}`);

    outputResults(results);
    
    console.log("Script completed successfully");
  } catch (error) {
    console.error("\nError occurred during execution:", error);
    
    if (results.length > 0) {
      console.log(`\nOutputting partial results (${results.length} links processed before error):`);
      outputResults(results, "PARTIAL RESULTS (Error Occurred)");
    } else {
      console.log("No results to output - error occurred before any links were verified");
    }
    
    throw error;
  }
}

main().catch((err) => {
  console.error("Application error:", err);
  process.exit(1);
});