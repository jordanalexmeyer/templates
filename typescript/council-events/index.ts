// Stagehand + Browserbase: Philadelphia Council Events Scraper - See README.md for full documentation
import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

/**
 * Searches Philadelphia Council Events for 2025 and extracts event information.
 * Uses AI-powered browser automation to navigate and interact with the site.
 */
async function main() {
  console.log("Starting Philadelphia Council Events automation...");

  // Initialize Stagehand with Browserbase for cloud-based browser automation
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

    // Navigate to Philadelphia Council
    console.log("Navigating to: https://phila.legistar.com/");
    await page.goto("https://phila.legistar.com/");
    console.log("Page loaded successfully");

    // Click calendar from the navigation menu
    console.log("Clicking calendar from the navigation menu");
    await stagehand.act("click calendar from the navigation menu");

    // Select 2025 from the month dropdown
    console.log("Selecting 2025 from the month dropdown");
    await stagehand.act("select 2025 from the month dropdown");

    // Extract event data using AI to parse the structured information
    console.log("Extracting event information...");
    const { data: results } = await stagehand.extract(
      "Extract the table with the name, date and time of the events",
      z.object({
        results: z.array(
          z.object({
            name: z.string(),
            date: z.string(),
            time: z.string(),
          }),
        ),
      }),
    );

    console.log(`Found ${results.results.length} events`);
    console.log("Event data extracted successfully:");
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error("Error during event extraction:", error);

    // Provide helpful troubleshooting information
    console.error("\nCommon issues:");
    console.error("1. Check .env file has BROWSERBASE_API_KEY");
    console.error("2. Ensure internet access and https://phila.legistar.com is accessible");
    console.error("3. Verify Browserbase account has sufficient credits");
    console.error("4. Check if the calendar page structure has changed");

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
