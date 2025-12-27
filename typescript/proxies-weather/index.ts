// Stagehand + Browserbase: Weather Proxy Demo - See README.md for full documentation

import "dotenv/config";
import { Browserbase } from "@browserbasehq/sdk";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

interface GeolocationConfig {
  city: string;
  country: string;
  state?: string;
}

// Creates a Browserbase session with geolocation proxies to route traffic through specific geographic locations
// This enables fetching location-specific weather data by simulating requests from different cities/countries
// See https://docs.browserbase.com/features/proxies for more geolocation options
async function createSessionWithGeoLocation(geolocation: GeolocationConfig) {
  // Configure proxy to route traffic through specified geographic location for location-specific weather data
  const proxyConfig: {
    type: "browserbase";
    geolocation: {
      city: string;
      country: string;
      state?: string;
    };
  } = {
    type: "browserbase", // Use Browserbase's managed proxy infrastructure for reliable geolocation routing
    geolocation: {
      city: geolocation.city, // City name (case-insensitive, e.g., "NEW_YORK", "new_york", "New York" all work)
      country: geolocation.country, // ISO country code (case-insensitive, e.g., "US", "us", "gb", "GB" all work)
    },
  };

  // Add state if provided (required for US locations to ensure accurate geolocation, case-insensitive)
  if (geolocation.state) {
    proxyConfig.geolocation.state = geolocation.state;
  }

  // Create Browserbase session with geolocation proxy configuration
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    proxies: [proxyConfig],
  });
  return session;
}

interface WeatherResult {
  city: string;
  country: string;
  temperature: number;
  unit: string;
  sessionUrl?: string;
  error?: string;
}

// Fetches weather data for a specific location using geolocation proxies
// Creates a Browserbase session with location-specific proxy, navigates to weather site,
// and extracts temperature data using Stagehand's structured extraction capabilities
async function getWeatherForLocation(geolocation: GeolocationConfig): Promise<WeatherResult> {
  const cityName = geolocation.city.replace(/_/g, " ");
  console.log(`\n=== Getting weather for ${cityName}, ${geolocation.country} ===`);

  // Create Browserbase session with geolocation proxies to route traffic through specified location
  console.log(`Creating Browserbase session with geolocation proxy for ${cityName}...`);
  const session = await createSessionWithGeoLocation(geolocation);
  console.log(`Session URL: https://browserbase.com/sessions/${session.id}`);

  // Initialize Stagehand with the existing Browserbase session to leverage geolocation proxies
  // This ensures all browser traffic routes through the specified geographic location
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 0,
    // 0 = errors only, 1 = info, 2 = debug
    // (When handling sensitive data like passwords or API keys, set verbose: 0 to prevent secrets from appearing in logs.)
    // https://docs.stagehand.dev/configuration/logging
    browserbaseSessionID: session.id, // Use the existing Browserbase session with geolocation proxies
  });

  try {
    // Initialize browser session to start automation
    console.log(`Initializing Stagehand for ${cityName}...`);
    await stagehand.init();
    console.log(`Stagehand initialized successfully for ${cityName}`);

    const page = stagehand.context.pages()[0];

    // Navigate to weather service - geolocation proxy ensures location-specific weather data
    console.log(`Navigating to weather service for ${cityName}...`);
    await page.goto("https://www.windy.com/", {
      waitUntil: "domcontentloaded",
    });
    console.log(`Page loaded for ${cityName}`);

    // Extract structured temperature data using Stagehand and Zod schema for type safety
    console.log(`Extracting temperature data for ${cityName}...`);
    const extractResult = await stagehand.extract(
      "Extract the current temperature and its unit",
      z.object({
        temperature: z.number().describe("The current temperature value"),
        unit: z.string().describe("The temperature unit)"),
      }),
    );

    console.log(
      `Successfully extracted weather data for ${cityName}: ${extractResult.temperature} ${extractResult.unit}`,
    );

    // Close Stagehand session to release resources
    await stagehand.close();

    return {
      city: cityName,
      country: geolocation.country,
      temperature: extractResult.temperature,
      unit: extractResult.unit,
      sessionUrl: `https://browserbase.com/sessions/${session.id}`,
    };
  } catch (error) {
    // Ensure session is closed even if extraction fails
    await stagehand.close().catch(() => {});
    console.error(`Error getting weather for ${cityName}:`, error);
    return {
      city: cityName,
      country: geolocation.country,
      temperature: 0,
      unit: "",
      sessionUrl: `https://browserbase.com/sessions/${session.id}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Displays formatted weather results for all processed locations
// Shows successful results with temperature data or error messages for failed locations
function displayResults(results: WeatherResult[]) {
  console.log("\n=== Weather Results ===");

  for (const result of results) {
    if (result.error) {
      console.log(`${result.city}, ${result.country}: Error - ${result.error}`);
      if (result.sessionUrl) {
        console.log(`  Session URL: ${result.sessionUrl}`);
      }
    } else {
      console.log(`${result.city}, ${result.country}: ${result.temperature} ${result.unit}`);
      if (result.sessionUrl) {
        console.log(`  Session URL: ${result.sessionUrl}`);
      }
    }
  }
}

// Main orchestration function: processes multiple locations sequentially using geolocation proxies
// Demonstrates how different proxy locations return different weather data from the same website
async function main() {
  // Define locations to test - demonstrating the power of geolocation proxies
  // Each location will route traffic through its respective geographic proxy to get location-specific weather
  // Note: All geolocation fields (city, country, state) are case-insensitive
  const locations: GeolocationConfig[] = [
    {
      city: "NEW_YORK",
      state: "NY", // State required for US locations (case-insensitive)
      country: "US",
    },
    {
      city: "LONDON",
      country: "GB",
    },
    {
      city: "TOKYO",
      country: "JP",
    },
    {
      city: "SAO_PAULO",
      country: "BR",
    },
  ];

  console.log("=== Weather Proxy Demo - Running Sequentially ===\n");
  console.log(`Processing ${locations.length} locations with geolocation proxies...`);
  console.log("Each location will use a different proxy to fetch location-specific weather data\n");

  // Collect all results for final summary
  const results: WeatherResult[] = [];

  // Run each location sequentially to show different weather based on proxy location
  // Sequential processing ensures clear demonstration of proxy-based location differences
  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    console.log(
      `\n[${i + 1}/${locations.length}] Processing ${location.city}, ${location.country}...`,
    );
    const result = await getWeatherForLocation(location);
    results.push(result);
  }

  // Display all results in formatted summary
  displayResults(results);

  console.log("\n=== All locations completed ===");
}

main().catch((err) => {
  console.error("Application error:", err);
  console.error("Common issues:");
  console.error("  - Check .env file has BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY");
  console.error(
    "  - Verify geolocation proxy locations are valid (see https://docs.browserbase.com/features/proxies)",
  );
  console.error("  - Ensure locations array is properly configured");
  console.error("Docs: https://docs.stagehand.dev/v3/first-steps/introduction");
  process.exit(1);
});
