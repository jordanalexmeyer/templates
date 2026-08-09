// Real Estate License Verification - See README.md for full documentation

import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

// License verification variables
const variables = {
  input1: "02237476", // DRE License ID to search for
};

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

  // Initialize browser session to start data extraction process.

  console.log(`Stagehand Session Started`);

  const page = (await browser.context.pages())[0];

  // Navigate to California DRE license verification website for data extraction.
  console.log("Navigating to: https://www2.dre.ca.gov/publicasp/pplinfo.asp");
  await page.goto("https://www2.dre.ca.gov/publicasp/pplinfo.asp");

  // Fill in license ID to search for specific real estate professional.
  console.log(`Performing action: type ${variables.input1} into the License ID input field`);
  await stagehand.act(`type ${variables.input1} into the License ID input field`);

  // Submit search form to retrieve license verification data.
  console.log(`Performing action: click the Find button`);
  await stagehand.act(`click the Find button`);

  // Extract structured license data using Zod schema for type safety and validation.
  console.log(`Extracting: extract all the license verification details for DRE#02237476`);
  const { data: extractedData4 } = await stagehand.extract(
    `extract all the license verification details for DRE#02237476`,
    z.object({
      licenseType: z.string().optional(), // Type of real estate license
      name: z.string().optional(), // License holder's full name
      mailingAddress: z.string().optional(), // Current mailing address
      licenseId: z.string().optional(), // Unique license identifier
      expirationDate: z.string().optional(), // License expiration date
      licenseStatus: z.string().optional(), // Current status (active, expired, etc.)
      salespersonLicenseIssued: z.string().optional(), // Date salesperson license was issued
      formerNames: z.string().optional(), // Any previous names used
      responsibleBroker: z.string().optional(), // Associated broker name
      brokerLicenseId: z.string().optional(), // Broker's license ID
      brokerAddress: z.string().optional(), // Broker's business address
      disciplinaryAction: z.string().optional(), // Any disciplinary actions taken
      otherComments: z.string().optional(), // Additional relevant information
    }),
  );
  console.log("Extracted:", extractedData4);

  // Always close session to release resources and clean up.
  await stagehand.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
