// Stagehand + Browserbase + Extend: Download Expense Receipts and Parse with Extend AI - See README.md for full documentation

import "dotenv/config";
import { Browserbase } from "@browserbasehq/sdk";
import { Stagehand } from "@browserbasehq/stagehand";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { ExtendClient } from "extend-ai";
import { exec } from "child_process";

// Opens a URL in the default browser (macOS) for live view and dashboard links
function openInBrowser(url: string): void {
  exec(`open "${url}"`, (error) => {
    if (error) {
      console.log(`Could not auto-open: ${url}`);
    }
  });
}

// Polls Browserbase API for completed downloads with retry logic.
// Retries every 2 seconds until downloads are ready or timeout is reached.
function saveDownloadsWithRetry(
  bb: Browserbase,
  sessionId: string,
  retryForSeconds: number = 60,
): { promise: Promise<number>; stopPolling: () => void } {
  // Track polling intervals and timeout for cleanup
  const intervals = {
    poller: undefined as NodeJS.Timeout | undefined,
    timeout: undefined as NodeJS.Timeout | undefined,
    isStopped: false,
  };

  // Cleanup function to stop all polling and timeouts
  const stopPolling = (): void => {
    if (intervals.isStopped) return;
    intervals.isStopped = true;
    if (intervals.poller) {
      clearInterval(intervals.poller);
      intervals.poller = undefined;
    }
    if (intervals.timeout) {
      clearTimeout(intervals.timeout);
      intervals.timeout = undefined;
    }
  };

  const promise = new Promise<number>((resolve, reject) => {
    console.log(`Waiting up to ${retryForSeconds} seconds for downloads to complete...`);

    // Fetch downloads from Browserbase API and save to disk when ready
    async function fetchDownloads(): Promise<void> {
      if (intervals.isStopped) return;

      try {
        console.log("Checking for downloads...");
        const response = await bb.sessions.downloads.list(sessionId);
        const downloadBuffer: ArrayBuffer = await response.arrayBuffer();

        // Save downloads to disk when file size indicates content is available
        if (downloadBuffer.byteLength > 100) {
          console.log(`Downloads ready! File size: ${downloadBuffer.byteLength} bytes`);
          fs.writeFileSync("downloaded_files.zip", Buffer.from(downloadBuffer));
          console.log("Files saved as: downloaded_files.zip");
          stopPolling();
          resolve(downloadBuffer.byteLength);
        } else {
          console.log("Downloads not ready yet, retrying...");
        }
      } catch (e: unknown) {
        if (intervals.isStopped) return;
        // Handle session not found errors gracefully (session may have expired)
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (
          errorMessage.includes("Session with given id not found") ||
          errorMessage.includes("-32001") ||
          errorMessage.includes("Invalid Session ID")
        ) {
          stopPolling();
          resolve(0);
          return;
        }
        // HTML error response - session may not be ready yet, keep retrying
        if (errorMessage.includes("Unexpected token '<'") || errorMessage.includes("<html")) {
          console.log("Session not ready yet, retrying...");
          return;
        }
        console.error("Error fetching downloads:", e);
        stopPolling();
        reject(e);
      }
    }

    // Set timeout to fail if downloads don't complete within retry window
    intervals.timeout = setTimeout(() => {
      if (!intervals.isStopped) {
        stopPolling();
        reject(new Error("Download timeout exceeded"));
      }
    }, retryForSeconds * 1000);

    // Poll every 2 seconds to check if downloads are ready
    intervals.poller = setInterval(fetchDownloads, 2000);
    fetchDownloads();
  });

  return { promise, stopPolling };
}

// Extracts receipt files from downloaded zip archive into output directories
function extractFilesFromZip(zipPath: string, outputDir: string = "output/documents"): string[] {
  console.log(`Extracting files from ${zipPath}...`);

  // Create output directories for documents and results if they don't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  if (!fs.existsSync("output/results")) {
    fs.mkdirSync("output/results", { recursive: true });
  }

  // Open zip file and iterate over entries
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  if (entries.length === 0) {
    throw new Error("No files found in the downloaded zip");
  }

  // Extract all non-directory entries and collect file paths
  const extractedFiles: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory) {
      const outputPath = path.join(outputDir, entry.entryName);
      zip.extractEntryTo(entry, outputDir, false, true);
      console.log(`Extracted: ${outputPath}`);
      extractedFiles.push(outputPath);
    }
  }

  console.log(`\nTotal files extracted: ${extractedFiles.length}`);
  return extractedFiles;
}

// Receipt extraction config for Extend AI
// Uses extraction_light base processor with parse_performance engine for low latency
const receiptExtractionConfig = {
  type: "EXTRACT",
  baseProcessor: "extraction_light",
  baseVersion: "3.4.0",
  parser: {
    engine: "parse_performance",
    target: "markdown",
    blockOptions: {
      text: {
        agentic: { enabled: false },
        signatureDetectionEnabled: false,
      },
      tables: {
        agentic: { enabled: false },
        targetFormat: "markdown",
        cellBlocksEnabled: false,
        tableHeaderContinuationEnabled: false,
      },
      figures: {
        enabled: false,
        figureImageClippingEnabled: false,
      },
    },
    engineVersion: "1.0.1",
    advancedOptions: {
      engine: "parse_performance",
      agenticOcrEnabled: false,
      pageBreaksEnabled: true,
      pageRotationEnabled: false,
      verticalGroupingThreshold: 1,
    },
    chunkingStrategy: { type: "document" },
  },
  schema: {
    type: "object",
    required: [
      "vendor_name",
      "receipt_date",
      "receipt_number",
      "total_amount",
      "subtotal_amount",
      "tax_amount",
      "line_items",
      "payment_method",
    ],
    properties: {
      vendor_name: {
        type: ["string", "null"],
        description: "The name of the merchant or vendor on the receipt.",
      },
      receipt_date: {
        type: ["string", "null"],
        description: "The date of the transaction shown on the receipt.",
        "extend:type": "date",
      },
      receipt_number: {
        type: ["string", "null"],
        description: "The receipt or transaction number, if present.",
      },
      total_amount: {
        type: "object",
        required: ["amount", "iso_4217_currency_code"],
        properties: {
          amount: { type: ["number", "null"] },
          iso_4217_currency_code: { type: ["string", "null"] },
        },
        description: "The total amount paid on the receipt.",
        "extend:type": "currency",
        additionalProperties: false,
      },
      subtotal_amount: {
        type: "object",
        required: ["amount", "iso_4217_currency_code"],
        properties: {
          amount: { type: ["number", "null"] },
          iso_4217_currency_code: { type: ["string", "null"] },
        },
        description: "The subtotal before tax, if shown.",
        "extend:type": "currency",
        additionalProperties: false,
      },
      tax_amount: {
        type: "object",
        required: ["amount", "iso_4217_currency_code"],
        properties: {
          amount: { type: ["number", "null"] },
          iso_4217_currency_code: { type: ["string", "null"] },
        },
        description: "The tax amount on the receipt.",
        "extend:type": "currency",
        additionalProperties: false,
      },
      line_items: {
        type: "array",
        items: {
          type: "object",
          required: ["description", "quantity", "unit_price", "amount"],
          properties: {
            description: {
              type: ["string", "null"],
              description: "Description of the item purchased.",
            },
            quantity: {
              type: ["number", "null"],
              description: "Quantity of the item, if shown.",
            },
            unit_price: {
              type: ["number", "null"],
              description: "Price per unit, if shown.",
            },
            amount: {
              type: ["number", "null"],
              description: "Total amount for this line item.",
            },
          },
          additionalProperties: false,
        },
        description: "Individual items on the receipt.",
      },
      payment_method: {
        type: ["string", "null"],
        description: "The payment method used (e.g., cash, credit card, etc.).",
      },
    },
    additionalProperties: false,
  },
  advancedOptions: {
    advancedMultimodalEnabled: false,
    citationsEnabled: true,
    arrayCitationStrategy: "item",
    pageRanges: [],
    chunkingOptions: {},
    advancedFigureParsingEnabled: true,
  },
};

// Gets existing Extend processor or creates a new one, saving the ID to .env for reuse.
// This avoids recreating the processor on every run.
async function getOrCreateProcessor(client: ExtendClient): Promise<string> {
  // Check if a processor ID already exists in environment
  const existingId = process.env.EXTEND_PROCESSOR_ID;
  if (existingId && existingId !== "YOUR_EXTEND_PROCESSOR_ID_HERE") {
    console.log(`Using existing processor: ${existingId}`);
    return existingId;
  }

  // Create a new Receipt Extractor processor via the Extend API
  console.log("No EXTEND_PROCESSOR_ID found. Creating 'Receipt Extractor' processor...");

  const response = await client.processor.create({
    name: "Receipt Extractor",
    type: "EXTRACT",
    config: receiptExtractionConfig as Parameters<typeof client.processor.create>[0]["config"],
  });

  const processorId = response.processor.id;
  console.log(`Created processor: ${processorId}`);
  console.log(`  View in dashboard: https://dashboard.extend.app/studio/processors/${processorId}`);

  // Persist the processor ID to .env so we don't recreate on next run
  const envPath = path.resolve(".env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf-8");
    if (envContent.includes("EXTEND_PROCESSOR_ID=")) {
      envContent = envContent.replace(
        /EXTEND_PROCESSOR_ID=.*/,
        `EXTEND_PROCESSOR_ID=${processorId}`,
      );
    } else {
      envContent += `\nEXTEND_PROCESSOR_ID=${processorId}\n`;
    }
    fs.writeFileSync(envPath, envContent);
  } else {
    fs.writeFileSync(envPath, `EXTEND_PROCESSOR_ID=${processorId}\n`, { flag: "a" });
  }
  console.log("  Saved EXTEND_PROCESSOR_ID to .env for future runs.");

  return processorId;
}

// Uploads receipt files to Extend AI, runs extraction, and saves results as JSON and CSV
async function parseReceiptsWithExtend(filePaths: string[]): Promise<void> {
  // Skip parsing if Extend API key is not configured
  if (!process.env.EXTEND_API_KEY || process.env.EXTEND_API_KEY === "YOUR_EXTEND_API_KEY_HERE") {
    console.log("\nWARNING: EXTEND_API_KEY not configured. Skipping receipt parsing.");
    console.log("   Add your Extend API key to .env to enable automatic receipt parsing.");
    return;
  }

  console.log("\n=== Parsing Receipts with Extend AI ===\n");

  // Initialize Extend AI client and get or create the receipt processor
  const client = new ExtendClient({ token: process.env.EXTEND_API_KEY });
  const processorId = await getOrCreateProcessor(client);

  console.log(`Processing ${filePaths.length} receipts...`);
  const runsUrl = `https://dashboard.extend.app/studio/processors/${processorId}?tab=Runs`;
  console.log(`View all runs: ${runsUrl}\n`);
  openInBrowser(runsUrl);

  // Process all files with retry on rate limiting (429 errors)
  const results: { file: string; runId?: string; runUrl?: string; data: unknown }[] = [];

  // Uploads a single file to Extend and runs extraction with exponential backoff retry
  async function processWithRetry(filePath: string, maxRetries = 3): Promise<(typeof results)[0]> {
    const fileName = path.basename(filePath);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Upload the file to Extend
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer]);
        const uploadResponse = await client.file.upload(
          blob as Parameters<typeof client.file.upload>[0],
        );
        const fileId = uploadResponse.file.id;

        // Run extraction on the uploaded file
        const extractionResponse = await client.processorRun.create({
          processorId,
          file: { fileId },
          sync: true,
          config: receiptExtractionConfig as Parameters<
            typeof client.processorRun.create
          >[0]["config"],
        });

        const parsedData = extractionResponse.processorRun;
        const runId = parsedData.id;
        const runUrl = `https://dashboard.extend.app/studio/processors/${processorId}/runs/${runId}`;
        console.log(`  Parsed ${fileName}`);
        console.log(`    → ${runUrl}`);
        return { file: fileName, runId, runUrl, data: parsedData };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isRetryable =
          errorMsg.includes("429") ||
          errorMsg.includes("rate") ||
          errorMsg.includes("disturbed or locked");

        if (isRetryable && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(
            `  Rate limited on ${fileName}, retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(`  Failed to parse ${fileName}:`, errorMsg);
          return { file: fileName, data: { error: errorMsg } };
        }
      }
    }
    return { file: fileName, data: { error: "Max retries exceeded" } };
  }

  // Process in batches of 9 to balance speed and reliability
  for (let i = 0; i < filePaths.length; i += 9) {
    const batch = filePaths.slice(i, i + 9);
    const batchResults = await Promise.all(batch.map((fp) => processWithRetry(fp)));
    results.push(...batchResults);
  }

  // Save results to JSON
  const jsonPath = "output/results/receipts.json";
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved JSON: ${jsonPath}`);

  // Convert results to CSV for easy viewing in spreadsheet tools
  const csvRows: string[] = [];
  csvRows.push(
    "file,run_url,vendor_name,receipt_date,receipt_number,total_amount,currency,subtotal,tax,payment_method,line_items_count",
  );

  // Shape of the extracted receipt data from Extend processor runs
  type ReceiptOutput = {
    vendor_name?: string;
    receipt_date?: string;
    receipt_number?: string;
    total_amount?: { amount?: string; iso_4217_currency_code?: string };
    subtotal_amount?: { amount?: string };
    tax_amount?: { amount?: string };
    payment_method?: string;
    line_items?: unknown[];
  };

  // Build CSV rows from extraction results
  for (const result of results) {
    const data = result.data as { output?: { value?: ReceiptOutput } } | undefined;
    const output: ReceiptOutput = data?.output?.value || {};
    const row = [
      result.file,
      result.runUrl || "",
      output.vendor_name || "",
      output.receipt_date || "",
      output.receipt_number || "",
      output.total_amount?.amount ?? "",
      output.total_amount?.iso_4217_currency_code || "",
      output.subtotal_amount?.amount ?? "",
      output.tax_amount?.amount ?? "",
      output.payment_method || "",
      Array.isArray(output.line_items) ? output.line_items.length : 0,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
    csvRows.push(row);
  }

  const csvPath = "output/results/receipts.csv";
  fs.writeFileSync(csvPath, csvRows.join("\n"));
  console.log(`Saved CSV:  ${csvPath}`);

  console.log(`\nView all runs: ${runsUrl}`);
}

async function main(): Promise<void> {
  console.log("Starting Expense Receipt Downloader...\n");

  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    throw new Error("BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required");
  }

  // Initialize Browserbase SDK for session management and download retrieval
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY as string,
  });

  // Initialize Stagehand with Browserbase for cloud-based browser automation
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 1,
    // 0 = errors only, 1 = info, 2 = debug
    // (When handling sensitive data like passwords or API keys, set verbose: 0 to prevent secrets from appearing in logs.)
    // https://docs.stagehand.dev/configuration/logging
    model: {
      modelName: "google/gemini-2.5-flash",
      apiKey: process.env.GOOGLE_API_KEY,
    },
  });

  let sessionId: string | undefined;

  try {
    // Initialize browser session to start automation
    await stagehand.init();
    console.log("Stagehand initialized successfully!");
    const page = stagehand.context.pages()[0];
    sessionId = stagehand.browserbaseSessionId;

    // Get live view URL for monitoring browser session in real-time
    if (sessionId) {
      const liveViewLinks = await bb.sessions.debug(sessionId);
      console.log(`Live View Link: ${liveViewLinks.debuggerFullscreenUrl}`);
      openInBrowser(liveViewLinks.debuggerFullscreenUrl);
    }

    // Navigate to the expense portal where receipts are hosted
    console.log("\nNavigating to expense portal...");
    await page.goto("https://v0-reimburse-me-expense-portal.vercel.app/", {
      waitUntil: "domcontentloaded",
    });

    // Use observe to find all individual download buttons (not the Download All button)
    console.log("\nFinding all individual download buttons...");
    const downloadButtons = await stagehand.observe(
      "Find all the small Download links on individual receipt cards.",
    );

    // Click each download button using observe → act pattern
    // Pass the observed action directly to act for precise element targeting
    let successCount = 0;
    for (let i = 0; i < downloadButtons.length; i++) {
      const action = downloadButtons[i];
      console.log(`Downloading receipt ${i + 1}/${downloadButtons.length}...`);

      try {
        await stagehand.act(action, { page });
        successCount++;
      } catch (clickError) {
        // If click fails, scroll element into view and retry
        console.log(`  Could not click download button ${i + 1}, trying to scroll and retry...`);
        try {
          await page.evaluate(() => window.scrollBy(0, 200));
          await stagehand.act(action, { page });
          successCount++;
        } catch {
          console.log(`  Skipping receipt ${i + 1}`);
        }
      }

      // Scroll down periodically to ensure elements are in view
      if ((i + 1) % 4 === 0 && i + 1 < downloadButtons.length) {
        await page.evaluate(() => window.scrollBy(0, 300));
      }
    }

    console.log(
      `\nDownload clicks completed! (${successCount}/${downloadButtons.length} successful)`,
    );

    // Retrieve all downloads triggered during this session from Browserbase API
    if (sessionId) {
      console.log("\nRetrieving downloads from Browserbase...");

      // Close the browser session before fetching downloads
      await stagehand.close();

      // Wait for session to finalize downloads before polling
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const { promise: downloadPromise, stopPolling } = saveDownloadsWithRetry(bb, sessionId, 60);

      try {
        const downloadSize = await downloadPromise;

        if (downloadSize > 0) {
          // Extract receipt files from downloaded zip archive
          const extractedFiles = extractFilesFromZip("downloaded_files.zip");

          console.log("\n=== Download Summary ===");
          console.log(`Total files downloaded: ${extractedFiles.length}`);
          console.log("Files saved to: ./output/documents/");

          // Parse downloaded receipts with Extend AI for structured data extraction
          await parseReceiptsWithExtend(extractedFiles);
        } else {
          console.log("No downloads were captured");
        }
      } catch (downloadError) {
        stopPolling();
        console.error("Download retrieval failed:", downloadError);
      }
    }

    console.log("\nExpense receipt download complete!");
  } catch (error) {
    console.error("Error during automation:", error);
    try {
      await stagehand.close();
    } catch {
      // Ignore close errors during cleanup
    }
    throw error;
  }
}

main().catch((err) => {
  console.error("Application error:", err);
  console.error("Common issues:");
  console.error(
    "  - Check .env file has BROWSERBASE_PROJECT_ID, BROWSERBASE_API_KEY, and GOOGLE_API_KEY",
  );
  console.error("  - Add EXTEND_API_KEY to .env to enable receipt parsing with Extend AI");
  console.error("  - Verify internet connection and expense portal accessibility");
  console.error("Docs: https://docs.stagehand.dev/v3/first-steps/introduction");
  process.exit(1);
});
