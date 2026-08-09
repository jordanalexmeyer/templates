// Stagehand + Browserbase: Gemini 3 Flash Example - See README.md for full documentation

import { browserbase, Stagehand } from "@browserbasehq/stagehand";

// ============================================================================
// EXAMPLE INSTRUCTIONS - Choose one to test different scenarios
// ============================================================================

// Example 1: Learning Plan Creation
// const instruction = `I want to learn more about Sourdough Bread Making. It's my first time learning about it, and want to get a good grasp by investing 1 hour a day for the next 2 months. Go find online courses/resources, create a plan cross-referencing the time I want to invest with the modules/timelines of the courses and return the plan`;

// Example 2: Flight Search
// const instruction = `Use flights.google.com to find the lowest fare from all eligible one-way flights for 1 adult from JFK to Heathrow in the next 30 days.`;

// Example 3: Solar Eclipse Research
const instruction = `Search for the next visible solar eclipse in North America and its expected date, and what about the one after that.`;

// Example 4: GitHub PR Verification
// const instruction = `Find the most recently opened non-draft PR on Github for Browserbase's Stagehand project and make sure the combination-evals in the PR validation passed.`;

// ============================================================================

async function main() {
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
    proxies: true,
    region: "us-west-2",
    browserSettings: {
      blockAds: true,
      viewport: {
        width: 1288,
        height: 711,
      },
    },
  });
  const stagehand = await Stagehand.create({
    browser,
    model: { modelName: "google/gemini-3-flash-preview" },
    logging: { level: "info" },
  });

  try {
    // Initialize browser session to start automation.

    console.log("Stagehand initialized successfully!");
    const page = (await browser.context.pages())[0];

    // Navigate to search engine with extended timeout for slow-loading sites.
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(instruction)}`, {
      waitUntil: "domcontentloaded",
    });

    console.log("Executing instruction:", instruction);
    const { data: result } = await stagehand.extract(
      "Answer the research question using the visible search results and include source URLs",
    );
    console.log("Task completed successfully!");
    console.log("Result:", result.extraction);
  } catch (error) {
    console.error("Error executing Gemini 3 Flash agent:", error);
  } finally {
    await stagehand.close();
    await browser.close();
    console.log("Session closed successfully");
  }
}

main().catch((err) => {
  console.error("Error in Gemini 3 Flash agent example:", err);
  console.error("Common issues:");
  console.error("  - Check .env file has BROWSERBASE_API_KEY");
  console.error("Docs: https://docs.stagehand.dev/v4/first-steps/introduction");
  process.exit(1);
});
