// Stagehand + Browserbase: Polymarket prediction market research - See README.md for full documentation

import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

/**
 * Searches Polymarket for a prediction market and extracts current odds, pricing, and volume data.
 * Uses AI-powered browser automation to navigate and interact with the site.
 */
async function main() {
  console.log("Starting Polymarket research automation...");

  // Initialize Stagehand with Browserbase for cloud-based browser automation
  // Using BROWSERBASE environment to run in cloud rather than locally
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const stagehand = await Stagehand.create({
    browser: browser,
    model: { modelName: "openai/gpt-4.1" },
    logging: { level: "info" },
  });

  try {
    // Initialize browser session
    console.log("Initializing browser session...");

    console.log("Stagehand session started successfully");

    const page = (await browser.context.pages())[0];

    const marketUrl =
      "https://polymarket.com/event/will-elon-musk-rejoin-the-trump-administration-in-2026";

    // Navigate directly to the intended market so homepage search UI changes
    // cannot silently send extraction to an unrelated page.
    console.log(`Navigating to: ${marketUrl}`);
    await page.goto(marketUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("Page loaded successfully");

    // Extract market data using AI to parse the structured information
    console.log("Extracting market information...");
    const { data: marketData } = await stagehand.extract(
      "Extract the current odds and market information for the prediction market",
      z.object({
        marketTitle: z.string().describe("the title of the market"),
        currentOdds: z.string().nullable().describe("the current odds or probability"),
        yesPrice: z.string().nullable().describe("the yes price"),
        noPrice: z.string().nullable().describe("the no price"),
        totalVolume: z.string().nullable().describe("the total trading volume"),
        priceChange: z.string().nullable().describe("the recent price change"),
      }),
    );

    if (!marketData.marketTitle.toLowerCase().includes("elon musk")) {
      throw new Error(`Unexpected market title: ${marketData.marketTitle || "empty"}`);
    }
    if (!marketData.currentOdds && !marketData.yesPrice && !marketData.noPrice) {
      throw new Error("Market extraction returned no live odds or prices");
    }

    console.log("Market data extracted successfully:");
    console.log(JSON.stringify(marketData, null, 2));
  } catch (error) {
    console.error("Error during market research:", error);

    // Provide helpful troubleshooting information
    console.error("\nCommon issues:");
    console.error("1. Check .env file has BROWSERBASE_API_KEY");
    console.error("2. Ensure internet access and https://polymarket.com is accessible");
    console.error("3. Verify Browserbase account has sufficient credits");

    throw error;
  } finally {
    // Clean up browser session
    console.log("Closing browser session...");
    await stagehand.close();
    await browser.close();
    console.log("Session closed successfully");
  }
}

main().catch((err) => {
  console.error("Application error:", err);
  process.exit(1);
});
