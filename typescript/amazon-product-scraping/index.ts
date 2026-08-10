// Stagehand + Browserbase: Amazon Product Scraping - See README.md for full documentation

import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

// ============= CONFIGURATION =============
// Update this value to search for different products
const SEARCH_QUERY = "Seiko 5";
// =========================================

// Schema for a single product with structured extraction fields
const ProductSchema = z.object({
  name: z.string().describe("The full product title/name"),
  price: z.string().describe("The product price including currency symbol (e.g., '$29.99')"),
  rating: z.string().describe("The star rating (e.g., '4.5 out of 5 stars')"),
  reviews_count: z.string().describe("The number of customer reviews (e.g., '1,234')"),
  product_url: z
    .string()
    .describe("The absolute or root-relative URL link to the product detail page on Amazon"),
});

// Schema for extracting multiple products from search results
const ProductsSchema = z.object({
  products: z.array(ProductSchema).describe("Array of the first 3 products from search results"),
});

async function main(): Promise<void> {
  console.log("Starting Amazon Product Scraping...");

  // Initialize Stagehand with Browserbase for cloud-based browser automation.
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const stagehand = await Stagehand.create({
    browser: browser,
    model: { modelName: "google/gemini-2.5-flash" },
    logging: { level: "info" },
  });

  try {
    // Initialize browser session to start automation.

    console.log("Stagehand initialized successfully!");
    const page = (await browser.context.pages())[0];

    // Alternative: skip the search bar and go straight to results by building the search URL.
    // Uncomment below to use direct navigation instead of stagehand.act() typing + clicking.
    // // Build search URL
    // const encodedQuery = encodeURIComponent(query).replace(/%20/g, "+");
    // const searchUrl = `https://www.amazon.com/s?k=${encodedQuery}`;

    // console.log(`Navigating to: ${searchUrl}`);
    // await page.goto(searchUrl, {
    //   waitUntil: "domcontentloaded",
    // });

    // Navigate directly to a deterministic search URL so a failed form action
    // cannot leave extraction on the Amazon homepage.
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(SEARCH_QUERY)}`;
    console.log(`Navigating to Amazon search: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Read Amazon's result cards deterministically. Known layouts are more
    // reliable and cheaper with locators/DOM reads than semantic extraction.
    console.log("Extracting product data...");
    const rawProducts = (await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-component-type="s-search-result"]'))
        .map((card) => {
          const productLinks = Array.from(
            card.querySelectorAll<HTMLAnchorElement>('a[href*="/dp/"]'),
          );
          const productLink = productLinks.find(
            (link) => link.href && (link.textContent?.trim().length ?? 0) > 10,
          );
          if (!productLink) return null;

          const brand = card.querySelector("h2 span")?.textContent?.trim() ?? "";
          const title = productLink.textContent?.trim() ?? "";
          return {
            name: [brand, title].filter(Boolean).join(" "),
            price: card.querySelector(".a-price .a-offscreen")?.textContent?.trim() ?? "",
            rating: card.querySelector(".a-icon-alt")?.textContent?.trim() ?? "",
            reviews_count:
              card
                .querySelector('[data-csa-c-content-id="alf-customer-ratings-count-component"]')
                ?.textContent?.trim() ??
              card.querySelector(".s-underline-text")?.textContent?.trim() ??
              "",
            product_url: productLink.href,
          };
        })
        .filter((product) => product !== null)
        .slice(0, 3),
    )) as unknown;
    const products = ProductsSchema.parse({ products: rawProducts });

    const normalizedProducts = products.products.map((product) => ({
      ...product,
      product_url: new URL(product.product_url, "https://www.amazon.com").href,
    }));
    if (normalizedProducts.length < 3) {
      throw new Error(`Expected 3 products, found ${normalizedProducts.length}`);
    }
    const queryTokens = SEARCH_QUERY.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const significantQueryTokens = queryTokens.filter((token) => token.length >= 3);
    const matchTokens = significantQueryTokens.length > 0 ? significantQueryTokens : queryTokens;
    const queryMatches = normalizedProducts.filter((product) => {
      const normalizedName = product.name.toLowerCase();
      return matchTokens.some((token) => normalizedName.includes(token));
    });
    if (queryMatches.length < 2) {
      throw new Error(
        `Search results did not match ${SEARCH_QUERY}: only ${queryMatches.length} products contained a query term`,
      );
    }
    if (
      normalizedProducts.some(
        (product) => !product.product_url.includes("/dp/") || product.name.length < 10,
      )
    ) {
      throw new Error("One or more product records lacked a full title or product-detail URL");
    }

    console.log("Products found:");
    console.log(JSON.stringify({ products: normalizedProducts }, null, 2));
  } catch (error) {
    console.error("Error during product scraping:", error);
    throw error;
  } finally {
    // Always close session to release resources and clean up.
    await stagehand.close();
    await browser.close();
    console.log("Session closed successfully");
  }
}

main().catch((err) => {
  console.error("Error in Amazon product scraping:", err);
  console.error("Common issues:");
  console.error("  - Check .env file has BROWSERBASE_API_KEY");
  console.error("  - Verify network connectivity");
  console.error("Docs: https://docs.stagehand.dev");
  process.exit(1);
});
