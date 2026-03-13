// Stagehand + Browserbase: LinkedIn Banner Screenshot - See README.md for full documentation

import "dotenv/config"; // Loads environment variables from .env into process.env
import { Stagehand } from "@browserbasehq/stagehand";
import { z as zod } from "zod/v3"; // Zod is a TypeScript-first schema validation library
import fs from "fs"; // Node.js built-in: file system operations (mkdir, writeFile)
import path from "path"; // Node.js built-in: cross-platform file path utilities

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

// The Gemini computer-use model. This specific variant supports vision-based
// browser control — it can "see" the screen and click/type like a human would.
// Used only for the autonomous agent step; not for act/extract/observe.
const DEFAULT_MODEL = "google/gemini-2.5-computer-use-preview-10-2025";

// Safety cap on how many individual steps the agent can take.
// Without this, a confused agent could loop indefinitely and consume credits.
const DEFAULT_MAX_STEPS = 20;

async function main() {
  // ---------------------------------------------------------------------------
  // ARGUMENT PARSING
  // ---------------------------------------------------------------------------
  // process.argv is an array of command-line arguments:
  //   argv[0] = "node" (the runtime)
  //   argv[1] = path to this script
  //   argv[2+] = arguments the user passed
  //
  // When you run `npm start -- "Browserbase"`, npm v7+ passes the "--" separator
  // through as an actual element in process.argv. We filter it out so that
  // `npm start -- "Browserbase"` and `npm start "Browserbase"` both work correctly.
  const companyName = process.argv.slice(2).find((arg) => arg !== "--");
  if (!companyName) {
    console.error("Usage: npm start -- <company name>");
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // STAGEHAND INITIALIZATION
  // ---------------------------------------------------------------------------
  // Stagehand is the AI browser automation layer built on top of Playwright.
  // Configuring it here does NOT yet open a browser — that happens at stagehand.init().
  const stagehand = new Stagehand({
    // "BROWSERBASE" means the browser runs in Browserbase's cloud infrastructure,
    // not on your local machine. This gives you a real, persistent Chromium browser
    // with a public IP address — better for scraping sites that block headless browsers.
    env: "BROWSERBASE",

    // The model used for Stagehand's built-in act(), observe(), and extract() calls.
    // "gemini-2.5-flash" is fast and cost-effective for structured data tasks.
    // This is separate from the CUA agent model defined below.
    model: { modelName: "google/gemini-2.5-flash", apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY },

    // experimental: true is required to unlock the .agent() API.
    // The agent feature is still in preview and not enabled by default.
    experimental: true,

    browserbaseSessionCreateParams: {
      browserSettings: {
        // advancedStealth hardens the browser's fingerprint to reduce bot detection.
        // LinkedIn actively blocks automated browsers, so this improves reliability.
        // Note: Only available on Scale plans.
        advancedStealth: true,
      },
      // proxies: true routes traffic through Browserbase's IP rotation pool.
      // This reduces the chance of LinkedIn rate-limiting or blocking your session
      // based on repeated requests from the same IP address.
      // Requires Browserbase Developer plan or higher.
      proxies: true,
    },
  });

  // ---------------------------------------------------------------------------
  // START THE BROWSER SESSION
  // ---------------------------------------------------------------------------
  // stagehand.init() spins up the Chromium browser in Browserbase and
  // establishes the connection. After this call, the browser is live and ready.
  await stagehand.init();
  console.log("Stagehand initialized successfully!");

  // Print the live session URL so you can watch the agent work in real time
  // from the Browserbase dashboard — useful for debugging unexpected behavior.
  console.log(
    `Live View Link: https://browserbase.com/sessions/${stagehand.browserbaseSessionID}`,
  );

  // Get a reference to the active browser page (the Playwright Page object).
  // This lets us call Playwright methods directly when needed (e.g., page.goto, page.screenshot).
  const page = stagehand.context.pages()[0];

  // Navigate to Google as the starting point for the agent.
  // The agent will take over from here to find the LinkedIn page.
  await page.goto("https://google.com");

  // ---------------------------------------------------------------------------
  // CREATE THE CUA AGENT
  // ---------------------------------------------------------------------------
  // A "CUA" (Computer Use Agent) is different from Stagehand's act/observe/extract:
  //
  //   act/observe/extract — you describe ONE specific action or data point at a time;
  //                         Stagehand executes it and returns control to your code.
  //
  //   agent              — you give a HIGH-LEVEL GOAL in plain English; the agent
  //                         autonomously plans and executes however many steps it needs
  //                         to complete that goal, using computer vision to navigate.
  //
  // Use agent when the navigation path is dynamic or hard to pre-script
  // (e.g., Google results can vary; the agent handles whatever it sees).
  const agent = stagehand.agent({
    // mode: "cua" activates the Computer Use Agent mode, which uses vision models
    // to interact with the browser by analyzing screenshots of the screen.
    mode: "cua",

    // The vision model powering the agent's decision-making.
    // Must be a computer-use capable model (see DEFAULT_MODEL above).
    model: DEFAULT_MODEL,

    // System prompt shapes the agent's behavior and persona.
    // Telling it not to ask follow-up questions makes it act autonomously
    // without pausing to check in with the user.
    systemPrompt: "You are a helpful assistant that can use a web browser. Do not ask follow up questions, use your best judgement.",
  });

  // ---------------------------------------------------------------------------
  // EXECUTE THE AGENT TASK
  // ---------------------------------------------------------------------------
  // agent.execute() hands the agent a goal and lets it run.
  // It will search Google, evaluate results, click links, and navigate
  // until it lands on the correct LinkedIn company page.
  await agent.execute({
    // The full task described in natural language.
    instruction: `Search for '${companyName} LinkedIn' on Google, click on the most likely LinkedIn result for ${companyName}, and wait for the page to fully load.
    Do not get to the LinkedIn page any other way than via the Google search result.`,

    // maxSteps is the upper bound on how many individual browser actions the agent
    // can take. Once this limit is reached, execution stops even if the task isn't done.
    maxSteps: DEFAULT_MAX_STEPS,
  });

  // ---------------------------------------------------------------------------
  // EXTRACT THE BANNER IMAGE URL
  // ---------------------------------------------------------------------------
  // The agent has landed on the LinkedIn page. Now we switch to Stagehand's
  // structured extract() to precisely pull a single value from the current page.
  //
  // Why not let the agent do this too?
  // extract() is more reliable for structured data — it uses the LLM specifically
  // for data extraction and validates the output against a schema.
  //
  // zod.string().url() is a Zod schema that tells Stagehand:
  //   "return a string, and it must be a valid URL"
  // If the extracted value isn't a URL, Stagehand will throw an error.
  const bannerImageLink = await stagehand.extract(
    "extract the banner image URL",
    zod.string().url(),
  );

  // ---------------------------------------------------------------------------
  // NAVIGATE DIRECTLY TO THE IMAGE
  // ---------------------------------------------------------------------------
  // By navigating to the raw image URL, we strip away all LinkedIn page chrome
  // (headers, sidebars, etc.) and get a page showing only the image.
  // This makes it trivial to screenshot just the banner without any surrounding UI.
  await page.goto(bannerImageLink);

  // ---------------------------------------------------------------------------
  // PREPARE THE OUTPUT DIRECTORY
  // ---------------------------------------------------------------------------
  const imagesDir = path.join(process.cwd(), "images");
  // recursive: true means mkdirSync won't throw an error if the "images/" folder
  // already exists — safe to call every run.
  fs.mkdirSync(imagesDir, { recursive: true });

  // ---------------------------------------------------------------------------
  // GET THE IMAGE ELEMENT'S BOUNDING BOX
  // ---------------------------------------------------------------------------
  // page.evaluate() runs JavaScript code inside the actual browser (not in Node.js).
  // We use it to locate the <img> element and read its exact screen coordinates
  // using getBoundingClientRect(), which returns { x, y, width, height } in pixels.
  //
  // This lets us crop the screenshot precisely to the image bounds —
  // no blank whitespace, no browser UI, just the banner pixels.
  const boundingBox = await page.evaluate(() => {
    const img = document.querySelector("img");
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  // ---------------------------------------------------------------------------
  // TAKE AND SAVE THE SCREENSHOT
  // ---------------------------------------------------------------------------
  // Build a filesystem-safe filename from the company name.
  // e.g., "Acme Corp" → "acme-corp-banner.png"
  const screenshotPath = path.join(imagesDir, `${companyName.toLowerCase().replace(/\s+/g, "-")}-banner.png`);

  // page.screenshot() captures the current browser viewport as a PNG buffer.
  // The `clip` option crops to the bounding box we measured above — if we couldn't
  // find a bounding box, we fall back to a full-page screenshot.
  const buffer = await page.screenshot(boundingBox ? { clip: boundingBox } : {});

  // Write the PNG buffer to disk.
  fs.writeFileSync(screenshotPath, buffer);
  console.log(`Screenshot saved to ${screenshotPath}`);

  // ---------------------------------------------------------------------------
  // CLOSE THE SESSION
  // ---------------------------------------------------------------------------
  // Always call stagehand.close() when done. This gracefully ends the Browserbase
  // session and releases the cloud browser resources. Forgetting to close will
  // leave the session running and continue consuming your plan's session minutes.
  await stagehand.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
