// Stagehand + Browserbase: Context Authentication Example - See README.md for full documentation

import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { Browserbase } from "@browserbasehq/sdk";
import { z } from "zod/v4";
import axios from "axios";
import fs from "fs";

async function uploadStagehandExtension(bb: Browserbase): Promise<{ id: string }> {
  const stagehandEntry = import.meta.resolve("@browserbasehq/stagehand");
  const archive = new URL("./assets/stagehand-extension.zip", stagehandEntry);
  return bb.extensions.create({ file: fs.createReadStream(archive) });
}

async function createSessionContextID() {
  console.log("Creating new Browserbase context...");
  // First create a context using Browserbase SDK to get a context ID.
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  const context = await bb.contexts.create();

  console.log("Created context ID:", context.id);

  // Create a single session using the context ID to perform initial login.
  console.log("Creating session for initial login...");
  const extension = await uploadStagehandExtension(bb);
  const session = await bb.sessions.create({
    extensionId: extension.id,
    browserSettings: {
      context: {
        id: context.id,
        persist: true, // Save authentication state to context
      },
    },
  });
  console.log("Live view: https://browserbase.com/sessions/" + session.id);

  // Connect Stagehand to the existing session (no new session created).
  console.log("Connecting Stagehand to session...");
  const browser = await browserbase.connect({
    apiKey: process.env.BROWSERBASE_API_KEY!,
    sessionId: session.id,
    extensionId: extension.id,
  });
  const stagehand = await Stagehand.create({
    browser: browser,
    model: { modelName: "openai/gpt-4.1" },
    logging: { level: "info" },
  });

  // Connect to existing session for login process.

  const page = (await browser.context.pages())[0];
  const email = process.env.SF_REC_PARK_EMAIL;
  const password = process.env.SF_REC_PARK_PASSWORD;

  // Navigate to login page with extended timeout for slow-loading sites.
  console.log("Navigating to SF Rec & Park login page...");
  await page.goto("https://www.rec.us/organizations/san-francisco-rec-park", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // Perform login sequence: each step is atomic to handle dynamic page changes.
  console.log("Starting login sequence...");
  await stagehand.act("Click the Login button");
  await stagehand.act(`Fill in the email or username field with "${email}"`);
  await stagehand.act("Click the next, continue, or submit button to proceed");
  await stagehand.act(`Fill in the password field with "${password}"`);
  await stagehand.act("Click the login, sign in, or submit button");
  console.log("Login sequence completed!");

  await stagehand.close();
  await browser.close();
  await bb.extensions.delete(extension.id, { headers: { "Content-Type": null } });
  console.log("Authentication state saved to context");

  // Return the context ID for reuse in future sessions.
  return { id: context.id };
}

async function deleteContext(contextId: string) {
  try {
    console.log("Cleaning up context:", contextId);
    // Delete context via Browserbase API to clean up stored authentication data.
    // This prevents accumulation of unused contexts and ensures security cleanup.
    const response = await axios.delete(`https://api.browserbase.com/v1/contexts/${contextId}`, {
      headers: {
        "X-BB-API-Key": process.env.BROWSERBASE_API_KEY,
      },
    });
    console.log("Context deleted successfully (status:", response.status + ")");
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error("Error deleting context:", err.response?.data || err.message || error);
  }
}

async function main() {
  console.log("Starting Context Authentication Example...");
  // Create context with login state for reuse in authenticated sessions.
  const contextId = await createSessionContextID();

  // Initialize new session using existing context to inherit authentication state.
  // persist: true ensures any new changes (cookies, cache) are saved back to context.
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
    browserSettings: {
      context: {
        id: contextId.id,
        persist: true,
      },
    },
  });
  const stagehand = await Stagehand.create({
    browser: browser,
    model: { modelName: "openai/gpt-4.1" },
    logging: { level: "info" },
  });

  // Creates session with inherited login state from context.
  console.log("Authenticated session ready!");

  const page = (await browser.context.pages())[0];

  // Navigate to authenticated area - should skip login due to persisted cookies.
  console.log("Navigating to authenticated area (should skip login)...");
  await page.goto("https://www.rec.us/organizations/san-francisco-rec-park", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // Navigate to user-specific area to access personal data.
  await stagehand.act("Click on the reservations button");

  // Extract structured user data using Zod schema for type safety.
  // Schema ensures consistent data format and validates extracted content.
  console.log("Extracting user profile data...");
  const { data: userData } = await stagehand.extract(
    "Extract the user's full name and address",
    z.object({
      fullName: z.string().describe("the user's full name"),
      address: z.string().describe("the user's address"),
    }),
  );

  console.log("Extracted user data:", userData);

  // Always close session to release resources and save any context changes.
  await stagehand.close();
  await browser.close();
  console.log("Session closed successfully");

  // Clean up context to prevent accumulation and ensure security.
  await deleteContext(contextId.id);
}

main().catch((err) => {
  console.error("Error in context authentication example:", err);
  console.error("Common issues:");
  console.error("  - Check .env file has SF_REC_PARK_EMAIL and SF_REC_PARK_PASSWORD");
  console.error("  - Verify BROWSERBASE_API_KEY is set");
  console.error("  - Ensure credentials are valid for SF Rec & Park");
  console.error("Docs: https://docs.stagehand.dev/v4/first-steps/introduction");
  process.exit(1);
});
