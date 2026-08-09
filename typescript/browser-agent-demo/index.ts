import { Browserbase } from "@browserbasehq/sdk";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import "dotenv/config";
import { z } from "zod/v4";

async function main() {
  const apiKey = process.env.BROWSERBASE_API_KEY!;

  if (!apiKey) {
    throw new Error("Missing BROWSERBASE_API_KEY. Get one at https://browserbase.com/settings");
  }

  // One API key, everything your agent needs to browse the web.
  // Docs: https://docs.browserbase.com
  const bb = new Browserbase({ apiKey });

  const query = "best coffee shops in San Francisco";

  // ─── STEP 1: SEARCH ─────────────────────────────────────────────────────────
  // Agents can quickly search the web for context without spinning up a browser.
  // Returns structured results (titles, URLs, metadata) for token-efficient decisions.
  // Docs: https://docs.browserbase.com/features/search

  console.log(`\nSTEP 1: SEARCH`);
  console.log(`   Searching for: "${query}"\n`);

  const searchData = await bb.search.web({
    query,
    numResults: 5,
  });

  console.log(`   Found ${searchData.results.length} results:`);
  for (const [i, result] of searchData.results.entries()) {
    console.log(`   ${i + 1}. ${result.title}`);
    console.log(`      ${result.url}`);
    if (result.publishedDate) {
      console.log(`      Published: ${result.publishedDate}`);
    }
  }

  const topResult = searchData.results[0];
  if (!topResult) {
    throw new Error("No search results found. Try a different query.");
  }

  const targetUrl = topResult.url;
  const targetTitle = topResult.title;
  console.log(`\n   -> Selected top result: "${targetTitle}"\n`);

  // ─── STEP 2: FETCH ──────────────────────────────────────────────────────────
  // Fetch page content (HTML, status, headers) for quick, token-efficient context —
  // no browser session needed. Use it for recon before sending an agent to interact.
  // Docs: https://docs.browserbase.com/features/fetch

  console.log(`STEP 2: FETCH`);
  console.log(`   Fetching content from: ${targetUrl}\n`);

  const fetchResult = await bb.fetchAPI.create({
    url: targetUrl,
    allowRedirects: true,
  });

  console.log(`   Status:         ${fetchResult.statusCode}`);
  console.log(`   Content-Type:   ${fetchResult.contentType}`);
  const fetchedContent =
    typeof fetchResult.content === "string"
      ? fetchResult.content
      : JSON.stringify(fetchResult.content);
  console.log(`   Content length: ${fetchedContent.length} chars`);

  const textPreview = fetchedContent
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 300);
  console.log(`   Preview:        ${textPreview}...`);
  console.log();

  // ─── STEP 3: STAGEHAND V4 ───────────────────────────────────────────────────
  // V4 exposes explicit browser APIs plus act, extract, and observe primitives.
  // Docs: https://docs.stagehand.dev/v4/first-steps/introduction

  console.log(`STEP 3: STAGEHAND V4`);
  console.log(`   Launching browser...\n`);

  // env: "BROWSERBASE" runs on Browserbase's headless browser infrastructure with
  // session replay, Agent Identity, and proxies built in.
  // The Model Gateway routes LLM requests through Browserbase — one API key gives
  // access to models from OpenAI, Anthropic, and Google with unified billing.
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const stagehand = await Stagehand.create({
    browser: browser,
    model: { modelName: "anthropic/claude-sonnet-4-6" },
  });

  try {
    console.log(`   Navigating to: ${targetUrl}`);

    const page = (await browser.context.pages())[0]!;
    await page.goto(targetUrl);

    const { data: research } = await stagehand.extract(
      `Extract the top 3 recommendations or key points from this page about "${targetTitle}". ` +
        "For each, include the name and a one-sentence summary of why it is notable.",
      z.object({
        recommendations: z.array(
          z.object({
            name: z.string(),
            summary: z.string(),
          }),
        ),
      }),
    );

    console.log(`\n   ── Stagehand Result ──`);
    console.log(research.recommendations);
  } finally {
    await stagehand.close();
    await browser.close();
  }

  console.log(`\nDone!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
