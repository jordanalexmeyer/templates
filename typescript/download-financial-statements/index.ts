// Stagehand + Browserbase: Download Apple's Quarterly Financial Statements - See README.md for full documentation

import { Browserbase } from "@browserbasehq/sdk";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import "dotenv/config";
import fs from "fs";

/**
 * Polls Browserbase API for downloads with timeout handling.
 * Retries every 2 seconds until downloads are ready or timeout is reached.
 */
async function saveDownloadsWithRetry(
  bb: Browserbase,
  sessionId: string,
  retryForSeconds: number = 30,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    console.log(`Waiting up to ${retryForSeconds} seconds for downloads to complete...`);

    const intervals = {
      poller: undefined as NodeJS.Timeout | undefined,
      timeout: undefined as NodeJS.Timeout | undefined,
    };

    async function fetchDownloads(): Promise<void> {
      try {
        console.log("Checking for downloads...");
        const response = await bb.sessions.downloads.list(sessionId);
        const downloadBuffer: ArrayBuffer = await response.arrayBuffer();

        if (downloadBuffer.byteLength > 0) {
          console.log(`Downloads ready! File size: ${downloadBuffer.byteLength} bytes`);
          fs.writeFileSync("downloaded_files.zip", Buffer.from(downloadBuffer));
          console.log("Files saved as: downloaded_files.zip");

          if (intervals.poller) clearInterval(intervals.poller);
          if (intervals.timeout) clearTimeout(intervals.timeout);
          resolve(downloadBuffer.byteLength);
        } else {
          console.log("Downloads not ready yet, retrying...");
        }
      } catch (e: unknown) {
        console.error("Error fetching downloads:", e);
        if (intervals.poller) clearInterval(intervals.poller);
        if (intervals.timeout) clearTimeout(intervals.timeout);
        reject(e);
      }
    }

    // Set timeout to prevent infinite polling if downloads never complete
    intervals.timeout = setTimeout(() => {
      if (intervals.poller) {
        clearInterval(intervals.poller);
      }
      reject(new Error("Download timeout exceeded"));
    }, retryForSeconds * 1000);

    // Poll every 2 seconds to check if downloads are ready
    intervals.poller = setInterval(fetchDownloads, 2000);
  });
}

async function main(): Promise<void> {
  console.log("Starting Apple Financial Statements Download Automation...");

  console.log("Initializing Browserbase client...");
  const bb: Browserbase = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY as string,
  });

  // V4's browser factory provisions and owns the Stagehand extension. The returned
  // browser exposes its Browserbase session ID for downloads and Live View APIs.
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const sessionId = browser.sessionId;
  if (!sessionId) throw new Error("Browserbase launch did not return a session ID");
  const stagehand: Stagehand = await Stagehand.create({
    browser: browser,
    logging: { level: "error", onLog: console.log },
  });

  try {
    // Initialize browser session to start automation

    console.log("Stagehand initialized successfully!");
    const context = browser.context;
    const page = (await context.pages())[0];

    // The session can be monitored from the Browserbase Sessions dashboard.
    // Avoid printing its signed Live View URL into application logs.
    console.log("Live View is available in the Browserbase Sessions dashboard");

    // Collect all four URLs before opening any PDF. Browserbase captures PDF
    // navigations as downloads, which can close the page that initiated them.
    console.log("Navigating to Apple Investor Relations...");
    await page.goto("https://investor.apple.com/investor-relations/default.aspx", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const statementUrls = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>("a"))
        .filter(
          (link) =>
            link.textContent?.trim() === "Financial Statements" && /fy2025/i.test(link.href),
        )
        .map((link) => link.href)
        .slice(0, 4),
    );
    if (statementUrls.length !== 4 || new Set(statementUrls).size !== 4) {
      throw new Error(`Expected four FY2025 statements, found ${statementUrls.length}`);
    }

    console.log("Downloading four quarterly financial statements...");
    for (const [index, statementUrl] of statementUrls.entries()) {
      const response = await fetch(statementUrl, { method: "HEAD" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
        throw new Error(`Q${4 - index} statement URL did not return a PDF`);
      }
      await page.evaluate((url: string) => {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, statementUrl);
      await page.waitForTimeout(500);
      console.log(`Triggered FY2025 Q${4 - index} download`);
    }

    // Retrieve all downloads triggered during this session from Browserbase API
    console.log("Retrieving downloads from Browserbase...");
    await saveDownloadsWithRetry(bb, sessionId, 45);
    console.log("All downloads completed successfully!");

    console.log("\nStagehand Metrics:");
    console.log(await stagehand.metrics());
  } catch (error) {
    console.error("Error during automation:", error);
    throw error;
  } finally {
    // Always close session to release resources and clean up
    await stagehand.close().catch((error) => console.warn("Stagehand cleanup warning:", error));
    await browser.close().catch((error) => console.warn("Browser cleanup warning:", error));
    console.log("Session closed successfully");
  }
}

main().catch((err) => {
  console.error("Application error:", err);
  console.error("Common issues:");
  console.error("  - Check .env file has BROWSERBASE_API_KEY");
  console.error("  - Verify internet connection and Apple website accessibility");
  console.error("  - Ensure sufficient timeout for slow-loading pages");
  console.error("Docs: https://docs.stagehand.dev/v4/first-steps/introduction");
  process.exit(1);
});
