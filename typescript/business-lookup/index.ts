// Browserbase Fetch API: Business Lookup - See README.md for full documentation

import Browserbase from "@browserbasehq/sdk";
import "dotenv/config";
import { z } from "zod/v4";

const BUSINESS_NAME = process.env.BUSINESS_NAME ?? "Jalebi Street";
const DATASET_URL = "https://data.sfgov.org/resource/g8m3-pdis.json";

const RawRecordSchema = z.record(z.string(), z.unknown());
const BusinessSchema = z.object({
  dbaName: z.string(),
  ownershipName: z.string().nullable(),
  businessAccountNumber: z.string(),
  locationId: z.string().nullable(),
  streetAddress: z.string().nullable(),
  businessStartDate: z.string().nullable(),
  businessEndDate: z.string().nullable(),
  neighborhood: z.string().nullable(),
  naicsCode: z.string().nullable(),
  naicsCodeDescription: z.string().nullable(),
  sourceUrl: z.string().url(),
});

function stringField(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function main(): Promise<void> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) throw new Error("BROWSERBASE_API_KEY is required");

  const sourceUrl = new URL(DATASET_URL);
  sourceUrl.searchParams.set("$q", BUSINESS_NAME);
  sourceUrl.searchParams.set("$limit", "5");

  console.log(`Fetching official SF Open Data records for ${JSON.stringify(BUSINESS_NAME)}...`);
  const bb = new Browserbase({ apiKey });
  const response = await bb.fetchAPI.create({
    url: sourceUrl.toString(),
    format: "raw",
    allowRedirects: true,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`SF Open Data returned HTTP ${response.statusCode}`);
  }
  if (typeof response.content !== "string") {
    throw new Error("Expected a raw JSON response from SF Open Data");
  }

  const records = z.array(RawRecordSchema).parse(JSON.parse(response.content));
  const record = records.find(
    (candidate) =>
      stringField(candidate, "dba_name")?.localeCompare(BUSINESS_NAME, undefined, {
        sensitivity: "accent",
      }) === 0,
  );
  if (!record) {
    throw new Error(`No exact DBA record found in ${records.length} returned records`);
  }

  const business = BusinessSchema.parse({
    dbaName: stringField(record, "dba_name"),
    ownershipName: stringField(record, "ownership_name"),
    businessAccountNumber: stringField(record, "ttxid"),
    locationId: stringField(record, "uniqueid"),
    streetAddress: stringField(record, "full_business_address", "street_address"),
    businessStartDate: stringField(record, "dba_start_date", "business_start_date"),
    businessEndDate: stringField(record, "dba_end_date", "business_end_date"),
    neighborhood: stringField(record, "neighborhoods_analysis_boundaries", "neighborhood"),
    naicsCode: stringField(record, "naics_code", "naic_code"),
    naicsCodeDescription: stringField(record, "naics_code_description", "naic_code_description"),
    sourceUrl: sourceUrl.toString(),
  });

  console.log(JSON.stringify(business, null, 2));
}

main().catch((error) => {
  console.error("Business lookup failed:", error);
  process.exit(1);
});
