// Browserbase Proxy Testing Script - See README.md for full documentation

import { Browserbase } from "@browserbasehq/sdk";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

async function createSessionWithBuiltInProxies(extensionId: string) {
  // Use Browserbase's default proxy rotation for enhanced privacy and IP diversity.
  const session = await bb.sessions.create({
    extensionId,
    proxies: true, // Enables automatic proxy rotation across different IP addresses.
  });
  return session;
}

async function createSessionWithGeoLocation(extensionId: string) {
  // Route traffic through specific geographic location to test location-based restrictions.
  const session = await bb.sessions.create({
    extensionId,
    proxies: [
      {
        type: "browserbase", // Use Browserbase's managed proxy infrastructure.
        geolocation: {
          city: "NEW_YORK", // Simulate traffic from New York for testing geo-specific content.
          state: "NY", // See https://docs.browserbase.com/features/proxies for more geolocation options.
          country: "US",
        },
      },
    ],
  });
  return session;
}

async function _createSessionWithCustomProxies(extensionId: string) {
  // Use external proxy servers for custom routing or specific proxy requirements.
  const session = await bb.sessions.create({
    extensionId,
    proxies: [
      {
        type: "external", // Connect to your own proxy server infrastructure.
        server: "http://...", // Your proxy server endpoint.
        username: "user", // Authentication credentials for proxy access.
        password: "pass",
      },
    ],
  });
  return session;
}

async function testSession(
  sessionFunction: (extensionId: string) => Promise<{ id: string; connectUrl: string }>,
  sessionName: string,
) {
  console.log(`\n=== Testing ${sessionName} ===`);

  const stagehandEntry = import.meta.resolve("@browserbasehq/stagehand");
  const extension = await bb.extensions.create({
    file: fs.createReadStream(new URL("./assets/stagehand-extension.zip", stagehandEntry)),
  });
  let browser: Awaited<ReturnType<typeof browserbase.connect>> | undefined;
  let stagehand: Stagehand | undefined;

  try {
    // Create session with specific proxy configuration and preload Stagehand's V4 extension.
    const session = await sessionFunction(extension.id);
    console.log("Session URL: https://browserbase.com/sessions/" + session.id);

    browser = await browserbase.connect({
      apiKey: process.env.BROWSERBASE_API_KEY!,
      sessionId: session.id,
      extensionId: extension.id,
    });
    stagehand = await Stagehand.create({
      browser,
      model: { modelName: "openai/gpt-4.1" },
      logging: { level: "info" },
    });

    const stagehandPage = (await browser.context.pages())[0];

    // Navigate to IP info service to verify proxy location and IP address.
    await stagehandPage.goto("https://ipinfo.io/json", {
      waitUntil: "domcontentloaded",
    });

    // Extract structured IP and location data using Stagehand and Zod schema
    const { data: geoInfo } = await stagehand.extract(
      "Extract all IP information and geolocation data from the JSON response",
      z.object({
        ip: z.string().optional().describe("The IP address"),
        city: z.string().optional().describe("The city name"),
        region: z.string().optional().describe("The state or region"),
        country: z.string().optional().describe("The country code"),
        loc: z.string().optional().describe("The latitude and longitude coordinates"),
        timezone: z.string().optional().describe("The timezone"),
        org: z.string().optional().describe("The organization or ISP"),
        postal: z.string().optional().describe("The postal code"),
        hostname: z.string().optional().describe("The hostname if available"),
      }),
    );

    console.log("Geo Info:", JSON.stringify(geoInfo, null, 2));
  } catch (error) {
    console.error("Error during Stagehand extraction:", error);
  } finally {
    await stagehand?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await bb.extensions
      .delete(extension.id, { headers: { "Content-Type": null } })
      .catch(() => undefined);
  }

  console.log(`${sessionName} test completed`);
}

async function main() {
  // Test 1: Built-in proxies - Verify default proxy rotation works and shows different IPs.
  await testSession(createSessionWithBuiltInProxies, "Built-in Proxies");

  // Test 2: Geolocation proxies - Confirm traffic routes through specified location (New York).
  await testSession(createSessionWithGeoLocation, "Geolocation Proxies (New York)");

  // Test 3: Custom external proxies - Enable if you have a custom proxy server set up.
  // await testSession(_createSessionWithCustomProxies, "Custom External Proxies");
  console.log("\n=== All tests completed ===");
}

main();
