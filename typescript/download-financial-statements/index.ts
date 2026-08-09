// Stagehand + Browserbase: Download Apple's Quarterly Financial Statements - See README.md for full documentation

import { Browserbase } from "@browserbasehq/sdk";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import "dotenv/config";
import fs from "fs";

async function uploadStagehandExtension(bb: Browserbase): Promise<{ id: string }> {
  const stagehandEntry = import.meta.resolve("@browserbasehq/stagehand");
  const archive = new URL("./assets/stagehand-extension.zip", stagehandEntry);
  return bb.extensions.create({ file: fs.createReadStream(archive) });
}

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

  const extension = await uploadStagehandExtension(bb);
  const session = await bb.sessions.create({ extensionId: extension.id });

  // Attach Stagehand to the Browserbase session so its ID remains available for downloads.
  const browser = await browserbase.connect({
    apiKey: process.env.BROWSERBASE_API_KEY!,
    sessionId: session.id,
    extensionId: extension.id,
  });
  const stagehand: Stagehand = await Stagehand.create({
    browser: browser,
    logging: { level: "error", onLog: console.log },
  });

  try {
    // Initialize browser session to start automation

    console.log("Stagehand initialized successfully!");
    const context = browser.context;
    const page = (await context.pages())[0];

    // Display live view URL for debugging and monitoring
    const liveViewLinks = await bb.sessions.debug(session.id);
    console.log(`Live View Link: ${liveViewLinks.debuggerFullscreenUrl}`);

    // Navigate to Apple homepage with extended timeout for slow-loading sites
    console.log("Navigating to Apple.com...");
    await page.goto("https://www.apple.com/", { timeout: 60000 });

    // Navigate to investor relations section
    console.log("Navigating to Investors section...");
    await stagehand.act("Click the 'Investors' button at the bottom of the page'");
    await stagehand.act("Scroll down to the Financial Data section of the page");
    await stagehand.act("Under Quarterly Earnings Reports, click on '2025'");

    // Download all quarterly financial statements
    // When a URL of a PDF is opened, Browserbase automatically downloads and stores the PDF
    // See https://docs.browserbase.com/features/screenshots#pdfs for more info
    console.log("Downloading quarterly financial statements...");
    await stagehand.act("Click the 'Financial Statements' link under Q4");
    await stagehand.act("Click the 'Financial Statements' link under Q3");
    await stagehand.act("Click the 'Financial Statements' link under Q2");
    await stagehand.act("Click the 'Financial Statements' link under Q1");

    // Retrieve all downloads triggered during this session from Browserbase API
    console.log("Retrieving downloads from Browserbase...");
    await saveDownloadsWithRetry(bb, session.id, 45);
    console.log("All downloads completed successfully!");

    console.log("\nStagehand Metrics:");
    console.log(await stagehand.metrics());
  } catch (error) {
    console.error("Error during automation:", error);
    throw error;
  } finally {
    // Always close session to release resources and clean up
    await stagehand.close();
    await browser.close();
    await bb.extensions.delete(extension.id, { headers: { "Content-Type": null } });
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
