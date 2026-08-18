// Stagehand + Browserbase: Philadelphia Council Events Scraper - See README.md for full documentation
import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

const CURRENT_YEAR = new Date().getUTCFullYear();

/** Searches the current Philadelphia Council calendar and extracts event information. */
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
    const page = (await browser.context.pages())[0];

    console.log(`Opening the ${CURRENT_YEAR} Philadelphia Council calendar...`);
    await page.goto("https://phila.legistar.com/Calendar.aspx", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const selection = await stagehand.act(`select ${CURRENT_YEAR} from the year dropdown`);
    if (!selection.data.success) {
      throw new Error(selection.data.message || `Could not select ${CURRENT_YEAR}`);
    }
    await page.waitForLoadState("domcontentloaded");

    // Extract event data using AI to parse the structured information
    console.log("Extracting event information...");
    const { data: results } = await stagehand.extract(
      `Extract every ${CURRENT_YEAR} event currently visible in the calendar table, including its name, date, and time`,
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

    if (results.results.length === 0) {
      throw new Error(`No ${CURRENT_YEAR} council events were extracted`);
    }

    console.log(`Found ${results.results.length} events for ${CURRENT_YEAR}`);
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
    try {
      await stagehand.close();
    } catch (error) {
      console.warn("Stagehand cleanup warning:", error);
    }
    try {
      await browser.close();
    } catch (error) {
      console.warn("Browser cleanup warning:", error);
    }
  }
}

main().catch((err) => {
  console.error("Application error:", err);
  process.exit(1);
});
