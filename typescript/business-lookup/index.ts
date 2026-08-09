// Business Lookup with Agent - See README.md for full documentation

import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

// Business search variables
const businessName = "Jalebi Street";

async function main() {
  // Initialize Stagehand with Browserbase for cloud-based browser automation.
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const stagehand = await Stagehand.create({
    browser: browser,
    model: { modelName: "openai/gpt-4.1" },
    logging: { level: "info" },
  });

  try {
    // Initialize browser session to start automation.

    console.log("Stagehand initialized successfully!");
    const page = (await browser.context.pages())[0];

    // Navigate to SF Business Registry search page.
    console.log(`Navigating to SF Business Registry...`);
    await page.goto("https://data.sfgov.org/stories/s/Registered-Business-Lookup/k6sk-2y6w/");

    console.log(`Searching for business: ${businessName}`);
    await stagehand.act("Open the business registry filter controls");
    await stagehand.act("Choose DBA Name as the filter field");
    await stagehand.act(`Type "${businessName}" into the filter value field`);
    await stagehand.act("Apply the business registry filter");
    await stagehand.act(`Open the result row for "${businessName}"`);
    await stagehand.act("Scroll the business details horizontally to reveal the NAICS code");

    // Extract comprehensive business information after agent completes the search.
    console.log("Extracting business information...");
    const { data: businessInfo } = await stagehand.extract(
      "Extract all visible business information including DBA Name, Ownership Name, Business Account Number, Location Id, Street Address, Business Start Date, Business End Date, Neighborhood, NAICS Code, and NAICS Code Description",
      z.object({
        dbaName: z.string(),
        ownershipName: z.string().optional(),
        businessAccountNumber: z.string(),
        locationId: z.string().optional(),
        streetAddress: z.string().optional(),
        businessStartDate: z.string().optional(),
        businessEndDate: z.string().optional(),
        neighborhood: z.string().optional(),
        naicsCode: z.string(),
        naicsCodeDescription: z.string().optional(),
      }),
      { page },
    );

    console.log("Business Information:");
    console.log(JSON.stringify(businessInfo, null, 2));
  } catch (error) {
    console.error("Error during business lookup:", error);
  } finally {
    // Always close session to release resources and clean up.
    await stagehand.close();
    await browser.close();
    console.log("Session closed successfully");
  }
}

main().catch((err) => {
  console.error("Error in business lookup:", err);
  console.error("Common issues:");
  console.error("  - Check .env file has BROWSERBASE_API_KEY");
  console.error("Docs: https://docs.stagehand.dev/v4/first-steps/introduction");
  process.exit(1);
});
