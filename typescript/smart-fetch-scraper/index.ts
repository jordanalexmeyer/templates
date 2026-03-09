// Stagehand + Browserbase: Smart Fetch Scraper - See README.md for full documentation
//
// Tries the Browserbase Fetch API first (fast, no browser session needed).
// If the page is JS-rendered or the content is insufficient, falls back to
// a full Stagehand browser session with AI-powered extraction.

import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

// ============= CONFIGURATION =============
const TARGET_URL = "https://news.ycombinator.com";

// Minimum character threshold — if Fetch API returns less than this,
// the page is likely JS-rendered and we fall back to a browser session.
const MIN_CONTENT_LENGTH = 500;
// =========================================

// Schema for structured page data extracted via Stagehand
const PageDataSchema = z.object({
  title: z.string().describe("The page title"),
  items: z
    .array(
      z.object({
        title: z.string().describe("The headline or item title"),
        url: z.string().describe("The link URL"),
        metadata: z.string().describe("Any subtitle, score, author, or timestamp info"),
      }),
    )
    .describe("The main list of items, articles, or entries on the page"),
});

/**
 * Attempt to fetch a page using the Browserbase Fetch API.
 * This is a lightweight HTTP request — no browser spins up.
 * Returns the raw HTML content or null if the response is too small / fails.
 */
async function tryFetchApi(
  url: string,
): Promise<{ content: string; statusCode: number } | null> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) {
    throw new Error("BROWSERBASE_API_KEY is required");
  }

  console.log("[Fetch API] Attempting lightweight fetch...");

  try {
    const response = await fetch("https://api.browserbase.com/v1/fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bb-api-key": apiKey,
      },
      body: JSON.stringify({
        url,
        allowRedirects: true,
      }),
    });

    if (!response.ok) {
      console.log(
        `[Fetch API] Request failed with status ${response.status}: ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      status_code: number;
      content: string;
      content_type: string;
    };

    console.log(`[Fetch API] Got response: status=${data.status_code}, length=${data.content.length} chars`);

    // Check if we got enough content to be useful
    if (data.content.length < MIN_CONTENT_LENGTH) {
      console.log(
        `[Fetch API] Content too short (${data.content.length} < ${MIN_CONTENT_LENGTH}), likely JS-rendered`,
      );
      return null;
    }

    return { content: data.content, statusCode: data.status_code };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[Fetch API] Failed: ${message}`);
    return null;
  }
}

/**
 * Parse basic data from raw HTML without a browser.
 * This is a simple regex-based extraction for demonstration.
 * For production use, consider a proper HTML parser like cheerio.
 */
function parseFromHtml(html: string): { title: string; linkCount: number } {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "Unknown";
  const linkCount = (html.match(/<a\s/gi) || []).length;
  return { title, linkCount };
}

/**
 * Fall back to a full Stagehand browser session for JS-heavy pages.
 * Uses AI-powered extraction to pull structured data from the rendered DOM.
 */
async function extractWithBrowser(url: string) {
  console.log("\n[Browser] Starting Stagehand session...");

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 1,
    model: "google/gemini-2.5-flash",
  });

  try {
    await stagehand.init();
    console.log(
      `[Browser] Live View: https://browserbase.com/sessions/${stagehand.browserbaseSessionID}`,
    );

    const page = stagehand.context.pages()[0];
    await page.goto(url);

    console.log("[Browser] Page loaded, extracting structured data with AI...");

    const data = await stagehand.extract(
      "Extract the page title and all the main items/articles/entries visible on this page. For each item get its title, URL, and any metadata like score, author, or timestamp.",
      PageDataSchema,
    );

    return data;
  } finally {
    await stagehand.close();
    console.log("[Browser] Session closed");
  }
}

async function main(): Promise<void> {
  console.log(`Smart Fetch Scraper — target: ${TARGET_URL}`);
  console.log("Strategy: Fetch API first, browser fallback if needed\n");

  // Step 1: Try the fast path
  const fetchResult = await tryFetchApi(TARGET_URL);

  if (fetchResult) {
    console.log("\n[Fetch API] Success! Parsing HTML content...");
    const parsed = parseFromHtml(fetchResult.content);
    console.log(`  Title: ${parsed.title}`);
    console.log(`  Links found: ${parsed.linkCount}`);
    console.log(`  Status code: ${fetchResult.statusCode}`);
    console.log(`  Content length: ${fetchResult.content.length} chars`);
    console.log("\nThe Fetch API returned sufficient content.");
    console.log("For richer structured extraction, the browser fallback is also available.\n");

    // Optionally, you can still use the browser for richer extraction:
    // const structured = await extractWithBrowser(TARGET_URL);
    // console.log(JSON.stringify(structured, null, 2));

    console.log("Preview (first 500 chars):");
    console.log(fetchResult.content.slice(0, 500));
  } else {
    // Step 2: Fetch API didn't return enough — use a real browser
    console.log("\n[Fetch API] Insufficient content, falling back to browser...\n");

    const structured = await extractWithBrowser(TARGET_URL);
    console.log("\nExtracted data:");
    console.log(JSON.stringify(structured, null, 2));
  }
}

main().catch((err) => {
  console.error("Error:", err);
  console.error("Common issues:");
  console.error("  - Check .env has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY");
  console.error("  - Verify GOOGLE_API_KEY is set for the model (browser fallback)");
  console.error("  - Verify network connectivity");
  console.error("Docs: https://docs.stagehand.dev");
  process.exit(1);
});
