// Dynamic Form Filling with Agent - See README.md for full documentation

import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";

// Trip details to be used for form filling
const tripDetails = `I'm planning a Summer in Japan. We're going to Tokyo, Kyoto, and Osaka (Japan) for 14 days. There will be 2 of us, and our budget is around $3,500 USD. We have a couple of dietary needs: vegetarian, and no shellfish. For activities, we'd love food tours, historical sites and temples, nature/scenic walks, local markets, and generally an itinerary that's easy to do with public transit. For accommodation, we prefer mid-range hotels or a traditional ryokan. We like a relaxed pace, with maybe a few busier days mixed in. It's our first time in Japan, and we'd love help balancing must-see attractions with less touristy experiences, plus recommendations for vegetarian-friendly restaurants.`;

async function main() {
  // Initialize Stagehand with Browserbase for cloud-based browser automation.
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const stagehand = await Stagehand.create({ browser: browser, logging: { level: "error" } });

  try {
    // Initialize browser session to start automation.

    console.log(`Stagehand Session Started`);
    const page = (await browser.context.pages())[0];

    // Navigate to the trip example form.
    console.log("Navigating to form...");
    await page.goto("https://forms.gle/DVX84XynAJwUWNu26");

    // V4 replaces agent() with explicit, reviewable steps. Each act call performs one action.
    console.log("\nFilling out the form with Stagehand V4 primitives...");
    await stagehand.act("Fill the trip destinations field with Tokyo, Kyoto, and Osaka, Japan");
    await stagehand.act("Set the trip duration to 14 days");
    await stagehand.act("Set the number of travelers to 2");
    await stagehand.act("Set the trip budget to 3500 USD");
    await stagehand.act("Select vegetarian and no shellfish as dietary needs");
    await stagehand.act(
      "Select food tours, historical sites and temples, nature walks, and local markets as activities",
    );
    await stagehand.act("Select mid-range hotel or traditional ryokan as accommodation");
    await stagehand.act("Select a relaxed travel pace and public transit preference");
    await stagehand.act(`Fill any additional details field with: ${tripDetails}`);
    await stagehand.act("Click the submit button");
    console.log("Form filled successfully!");
  } catch (error) {
    console.error("Error during form filling:", error);
  } finally {
    // Always close session to release resources and clean up.
    await stagehand.close();
    await browser.close();
    console.log("Session closed successfully");
  }
}

main().catch((err) => {
  console.error("Error in dynamic form filling:", err);
  console.error("Common issues:");
  console.error("  - Check .env file has BROWSERBASE_API_KEY");
  console.error("  - Ensure the form URL is accessible and form fields are available");
  console.error("Docs: https://docs.stagehand.dev/v4/first-steps/introduction");
  process.exit(1);
});
