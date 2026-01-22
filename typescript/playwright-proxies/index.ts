import { chromium } from "playwright-core";
import { Browserbase } from "@browserbasehq/sdk";
import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

interface GeoInfo {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  timezone?: string;
  org?: string;
  postal?: string;
  hostname?: string;
}

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;

if (!BROWSERBASE_API_KEY) {
  throw new Error("BROWSERBASE_API_KEY environment variable is required");
}
if (!BROWSERBASE_PROJECT_ID) {
  throw new Error("BROWSERBASE_PROJECT_ID environment variable is required");
}

const bb = new Browserbase({ apiKey: BROWSERBASE_API_KEY });

async function createSessionWithBuiltInProxies() {
  const session = await bb.sessions.create({
    projectId: BROWSERBASE_PROJECT_ID,
    proxies: true,
  });
  return session;
}

async function createSessionWithGeoLocation() {
  const session = await bb.sessions.create({
    projectId: BROWSERBASE_PROJECT_ID,
    proxies: [
      {
        type: "browserbase",
        geolocation: {
          city: "NEW_YORK",
          state: "NY",
          country: "US",
        },
      },
    ],
  });
  return session;
}

async function createSessionWithCustomProxies() {
  const proxyServer = process.env.CUSTOM_PROXY_SERVER;
  const proxyUsername = process.env.CUSTOM_PROXY_USERNAME;
  const proxyPassword = process.env.CUSTOM_PROXY_PASSWORD;

  if (!proxyServer || !proxyUsername || !proxyPassword) {
    throw new Error(
      "Custom proxy requires CUSTOM_PROXY_SERVER, CUSTOM_PROXY_USERNAME, and CUSTOM_PROXY_PASSWORD environment variables"
    );
  }

  const session = await bb.sessions.create({
    projectId: BROWSERBASE_PROJECT_ID,
    proxies: [
      {
        type: "external",
        server: proxyServer,
        username: proxyUsername,
        password: proxyPassword,
      },
    ],
  });
  return session;
}

async function testSessionBrowserbase(
  sessionFunction: () => Promise<{ id: string; connectUrl: string }>,
  sessionName: string
) {
  console.log(`\n=== Testing ${sessionName} ===`);

  const session = await sessionFunction();
  console.log("Session URL: https://browserbase.com/sessions/" + session.id);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const defaultContext = browser.contexts()[0];
  if (!defaultContext) {
    throw new Error("No default context found");
  }
  const page = defaultContext.pages()[0];
  if (!page) {
    throw new Error("No page found in default context");
  }

  try {
    console.log("Navigating to ipinfo.io/json...");
    await page.goto("https://ipinfo.io/json", {
      waitUntil: "domcontentloaded",
    });

    const bodyText = await page.textContent("body");
    if (!bodyText) {
      throw new Error("Failed to get page content");
    }

    let geoInfo: GeoInfo;
    try {
      geoInfo = JSON.parse(bodyText);
    } catch (parseError) {
      throw new Error(
        `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : parseError}`
      );
    }

    console.log("Geo Info:", JSON.stringify(geoInfo, null, 2));
  } catch (error) {
    console.error(
      "Error during extraction:",
      error instanceof Error ? error.message : error
    );
  }

  await browser.close();
  console.log(`${sessionName} test completed`);
}

async function main() {
  console.log("Browserbase Proxy Testing with Playwright");
  console.log("=========================================");
  console.log("This template demonstrates proxy features with Playwright and Browserbase SDK.");
  console.log("It uses pure Playwright + Browserbase SDK.\n");

  await testSessionBrowserbase(createSessionWithBuiltInProxies, "Built-in Proxies");

  await testSessionBrowserbase(createSessionWithGeoLocation, "Geolocation Proxies (New York)");

  console.log("\n=== All tests completed ===");
}

main().catch((err) => {
  console.error("Application error:", err);
  console.error("\nCommon issues:");
  console.error("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY");
  console.error("  - Verify your Browserbase plan supports proxies");
  console.error("Docs: https://docs.browserbase.com/features/proxies");
  process.exit(1);
});