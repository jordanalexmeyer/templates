// Browserbase: Smart Fetch Scraper — See README.md for full documentation
//
// Tries the Browserbase Fetch API first (fast, no browser session needed).
// If the page is JS-rendered or the content is insufficient, falls back to
// a Playwright browser session connected via Browserbase CDP.

import "dotenv/config";
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright";

// ============= CONFIGURATION =============

// Minimum character threshold — if Fetch API returns less than this,
// the page is likely JS-rendered and we fall back to a browser session.
const MIN_CONTENT_LENGTH = 500;

// Minimum ratio of visible text to raw HTML — pages below this are likely shells.
const MIN_TEXT_DENSITY = 0.05;

// Patterns that indicate the page requires JavaScript to render real content.
const JS_REQUIRED_PATTERNS = [
  /enable javascript/i,
  /javascript is (required|disabled|not enabled)/i,
  /please enable javascript/i,
  /this (site|page|app) requires javascript/i,
  /checking your browser/i, // Cloudflare challenge
  /<noscript>[^<]{200,}/i, // large noscript block = JS-gated content
];

// =========================================

/**
 * Returns the reason the Fetch API result should trigger a browser fallback,
 * or null if the content looks usable.
 */
function needsBrowserFallback(content: string, statusCode: number): string | null {
  // Non-2xx status: the page didn't load successfully
  if (statusCode < 200 || statusCode >= 300) {
    return `non-2xx status code (${statusCode})`;
  }

  // Too short: likely a JS shell
  if (content.length < MIN_CONTENT_LENGTH) {
    return `content too short (${content.length} < ${MIN_CONTENT_LENGTH} chars)`;
  }

  // JS-challenge / bot-detection page
  for (const pattern of JS_REQUIRED_PATTERNS) {
    if (pattern.test(content)) {
      return `JS-required pattern matched: ${pattern}`;
    }
  }

  // Low text density: strip all HTML tags and measure how much real text remains
  const textOnly = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const density = textOnly.length / content.length;
  if (density < MIN_TEXT_DENSITY) {
    return `text density too low (${(density * 100).toFixed(1)}% < ${MIN_TEXT_DENSITY * 100}%)`;
  }

  return null;
}

/**
 * Attempt to fetch a page using the Browserbase Fetch API.
 * This is a lightweight HTTP request — no browser spins up.
 * Returns the raw HTML content or null if the content fails usability checks.
 */
async function tryFetchApi(url: string): Promise<{ content: string; statusCode: number } | null> {
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

  console.log("[Fetch API] Attempting lightweight fetch...");

  try {
    const data = await bb.fetchAPI.create({ url, allowRedirects: true });

    console.log(`[Fetch API] Got response: status=${data.statusCode}, length=${data.content.length} chars`);

    const fallbackReason = needsBrowserFallback(data.content, data.statusCode);
    if (fallbackReason) {
      console.log(`[Fetch API] Content not usable — ${fallbackReason}`);
      return null;
    }

    return { content: data.content, statusCode: data.statusCode };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[Fetch API] Failed: ${message}`);
    return null;
  }
}

/**
 * Parse basic data from raw HTML without a browser.
 * Uses simple regex-based extraction — swap in cheerio for richer parsing.
 */
function parseFromHtml(html: string): { title: string; linkCount: number } {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "Unknown";
  const linkCount = (html.match(/<a\s/gi) || []).length;
  return { title, linkCount };
}

/**
 * Fall back to a full Playwright browser session for JS-heavy pages.
 * Connects to Browserbase via CDP, renders the page, and returns the HTML content.
 */
async function extractWithBrowser(url: string): Promise<string> {
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

  console.log("\n[Browser] Creating Browserbase session...");

  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    proxies: true,
    browserSettings: {
      advancedStealth: true,
      blockAds: true,
      solveCaptchas: true,
    },
  });

  console.log(`[Browser] Live View: https://browserbase.com/sessions/${session.id}`);

  const browser = await chromium.connectOverCDP(session.connectUrl);

  try {
    const page = browser.contexts()[0].pages()[0];
    await page.goto(url, { waitUntil: "domcontentloaded" });

    console.log("[Browser] Page loaded, extracting content...");

    return await page.content();
  } finally {
    await browser.close();
    console.log("[Browser] Session closed");
  }
}

async function main(): Promise<void> {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error("Usage: npm start <url>");
    console.error("Example: npm start https://news.ycombinator.com");
    process.exit(1);
  }

  console.log(`Smart Fetch Scraper — target: ${targetUrl}`);
  console.log("Strategy: Fetch API first, browser fallback if needed\n");

  try {
    // Step 1: Try the fast path
    const fetchResult = await tryFetchApi(targetUrl);

    // Step 2: Fetch API didn't return usable content — use a real browser
    const content = fetchResult?.content ?? await extractWithBrowser(targetUrl);
    const source = fetchResult ? "Fetch API" : "browser";

    console.log(`\n[${source}] Parsing HTML content...`);
    const parsed = parseFromHtml(content);
    console.log(`  Title: ${parsed.title}`);
    console.log(`  Links found: ${parsed.linkCount}`);
    console.log(`  Content length: ${content.length} chars`);

    console.log("\nPreview (first 500 chars):");
    console.log(content.slice(0, 500));
  } catch (error) {
    console.error("Error during scrape:", error);
    throw error;
  }
}

main().catch((err) => {
  console.error("Error:", err);
  console.error("Common issues:");
  console.error("  - Check .env has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY");
  console.error("  - Verify network connectivity");
  console.error("Docs: https://docs.browserbase.com/features/fetch");
  process.exit(1);
});
