// Browserbase Proxy Testing Script - See README.md for full documentation

import { browserbase, Stagehand, type BrowserbaseLaunchOptions } from "@browserbasehq/stagehand";
import { z } from "zod/v4";
import "dotenv/config";

const GeoInfoSchema = z.object({
  ip: z.string().min(1),
  city: z.string().min(1),
  region: z.string().min(1),
  country: z.string().min(1),
  loc: z.string().min(1),
  timezone: z.string().min(1),
  org: z.string().min(1),
  postal: z.string().optional(),
  hostname: z.string().optional(),
});

type GeoInfo = z.infer<typeof GeoInfoSchema>;

async function testSession(
  proxies: BrowserbaseLaunchOptions["proxies"],
  sessionName: string,
): Promise<GeoInfo> {
  console.log(`\n=== Testing ${sessionName} ===`);

  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
    proxies,
  });
  const stagehand = await Stagehand.create({
    browser,
    logging: { level: "error" },
  });

  try {
    console.log("Browserbase session launched");
    const page = (await browser.context.pages())[0];

    // ipinfo reports the public IP observed after Browserbase applies the proxy.
    await page.goto("https://ipinfo.io/json", { waitUntil: "domcontentloaded" });
    const body = await page.evaluate(() => document.body.textContent ?? "");
    const geoInfo = GeoInfoSchema.parse(JSON.parse(body));

    console.log("Geo Info:", JSON.stringify(geoInfo, null, 2));
    console.log(`${sessionName} test completed`);
    return geoInfo;
  } finally {
    await stagehand.close().catch((error) => console.warn("Stagehand cleanup warning:", error));
    await browser.close().catch((error) => console.warn("Browser cleanup warning:", error));
  }
}

async function main() {
  const builtIn = await testSession(true, "Built-in Proxies");

  const newYork = await testSession(
    [
      {
        type: "browserbase",
        geolocation: { city: "NEW_YORK", state: "NY", country: "US" },
      },
    ],
    "Geolocation Proxies (New York)",
  );

  if (
    newYork.country !== "US" ||
    !/new york/i.test(newYork.region) ||
    newYork.timezone !== "America/New_York"
  ) {
    throw new Error(
      `Expected a New York-region proxy; received ${newYork.city}, ${newYork.region}, ${newYork.country}`,
    );
  }
  if (builtIn.ip === newYork.ip) {
    throw new Error("Built-in and geolocation proxy sessions returned the same IP");
  }

  console.log("\n=== All proxy tests completed with distinct IPs ===");
}

main().catch((error) => {
  console.error("Proxy test failed:", error);
  process.exit(1);
});
