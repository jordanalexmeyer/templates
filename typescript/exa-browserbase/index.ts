// Stagehand + Browserbase + Exa: AI-Powered Job Search and Application - See README.md for full documentation

import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import Exa from "exa-js";
import { z } from "zod/v4";

// Candidate application details - customize these for your job search
const applicationDetails = {
  name: "John Doe",
  email: "john.doe@example.com",
  linkedInUrl: "https://linkedin.com/in/johndoe",
  resumePath: "./Dummy_CV.pdf",
  currentLocation: "San Francisco, CA",
  willingToRelocate: true,
  requiresSponsorship: false,
  visaStatus: "",
  phone: "+1-555-123-4567",
  portfolioUrl: "https://johndoe.dev",
  coverLetter: "I am excited to apply for this position...",
};

// Search configuration - modify to target different companies
const searchConfig = {
  companyQuery: "AI startups in SF",
  numCompanies: 5,
  // Concurrency: set to false for sequential (works on all plans); true = concurrent (requires Startup or Developer plan or higher)
  concurrent: true,
  maxConcurrentBrowsers: 5, // Max browsers when concurrent
  // Proxies: requires Developer plan or higher; residential proxies help avoid bot detection (https://docs.browserbase.com/features/proxies)
  useProxy: true,
};

// Zod schema for extracting structured job description data
const jobDescriptionSchema = z.object({
  jobTitle: z.string().optional(),
  companyName: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  responsibilities: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  location: z.string().optional(),
  workType: z.string().optional(),
  fullDescription: z.string().optional(),
});

// Careers page data structure for tracking discovered job pages
interface CareersPage {
  company: string;
  url: string;
  careersUrl: string;
}

// Uploads the resume with Stagehand V4's locator API.
async function uploadResume(stagehand: Stagehand, logPrefix: string = ""): Promise<void> {
  console.log(`${logPrefix}Attempting to upload resume...`);

  const page = await stagehand.browser.context.activePage();
  if (!page) throw new Error("No active page is available for resume upload");
  const fileInputs = await page.locator('input[type="file"]').count();

  if (fileInputs > 0) {
    await page.locator('input[type="file"]').first().setInputFiles(applicationDetails.resumePath);
    console.log(`${logPrefix}Resume uploaded successfully from main page!`);
    return;
  }

  console.log(`${logPrefix}No file upload field found on page`);
}

// Result of a single job application attempt
interface ApplicationResult {
  company: string;
  careersUrl: string;
  success: boolean;
  message: string;
  sessionUrl?: string;
}

// Applies to a single job posting
async function applyToJob(careersPage: CareersPage, index: number): Promise<ApplicationResult> {
  const logPrefix = `[${index + 1}/${searchConfig.numCompanies}] ${careersPage.company}: `;
  console.log(`\n${logPrefix}Starting application...`);

  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
    proxies: searchConfig.useProxy,
  });
  const stagehand = await Stagehand.create({
    browser: browser,
    model: { modelName: "google/gemini-2.5-pro" },
    logging: { level: "error" },
  });

  try {
    console.log(`${logPrefix}Session started`);

    const page = (await browser.context.pages())[0];
    await page.goto(careersPage.careersUrl);

    await stagehand.act("Open the first relevant job posting on this careers page");

    // Extract job description
    const { data: jobDescription } = await stagehand.extract(
      "extract the full job description including title, requirements, responsibilities, and any important details about the role",
      jobDescriptionSchema,
    );

    await stagehand.act("Open the application form for this job");
    await stagehand.act(`Fill the applicant name field with ${applicationDetails.name}`);
    await stagehand.act(`Fill the email field with ${applicationDetails.email}`);
    await stagehand.act(`Fill the phone field with ${applicationDetails.phone}`);
    await stagehand.act(`Fill the LinkedIn field with ${applicationDetails.linkedInUrl}`);
    await stagehand.act(`Fill the portfolio field with ${applicationDetails.portfolioUrl}`);
    await stagehand.act(`Fill the location field with ${applicationDetails.currentLocation}`);
    await stagehand.act(
      `Answer relocation questions with ${applicationDetails.willingToRelocate ? "yes" : "no"}`,
    );
    await stagehand.act(
      `Answer sponsorship questions with ${applicationDetails.requiresSponsorship ? "yes" : "no"}`,
    );
    await stagehand.act(
      `Fill the cover letter field with: ${applicationDetails.coverLetter} Relevant role: ${jobDescription.jobTitle ?? "the selected position"}`,
    );

    // Upload resume after form filling
    try {
      await uploadResume(stagehand, logPrefix);
    } catch (uploadError) {
      console.log(`${logPrefix}Could not upload resume:`, uploadError);
    }

    console.log(`${logPrefix}Form filled successfully!`);

    return {
      company: careersPage.company,
      careersUrl: careersPage.careersUrl,
      success: true,
      message: "Application form filled without submitting",
    };
  } catch (error) {
    console.error(`${logPrefix}Error:`, error);
    return {
      company: careersPage.company,
      careersUrl: careersPage.careersUrl,
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await stagehand.close();
    await browser.close();
    console.log(`${logPrefix}Session closed`);
  }
}

async function main() {
  console.log("Starting Exa + Browserbase Job Search and Application...");

  // Initialize Exa client for AI-powered company search
  const exa = new Exa(process.env.EXA_API_KEY);

  // Search for companies matching the criteria using Exa
  console.log(`Searching for companies: "${searchConfig.companyQuery}"...`);

  const companyResults = await exa.searchAndContents(searchConfig.companyQuery, {
    category: "company",
    text: true,
    type: "auto",
    livecrawl: "fallback",
    numResults: searchConfig.numCompanies,
  });

  console.log(`Found ${companyResults.results.length} companies:`);
  companyResults.results.forEach((company, i) => {
    console.log(`  ${i + 1}. ${company.title} - ${company.url}`);
  });

  if (companyResults.results.length === 0) {
    console.log("No companies found. Exiting.");
    return;
  }

  // Find careers pages for each discovered company
  console.log("\nSearching for careers pages...");
  const careersPages: CareersPage[] = [];

  for (const company of companyResults.results) {
    const companyDomain = new URL(company.url).hostname.replace("www.", "");
    console.log(`  Looking for careers page: ${companyDomain}...`);

    const careersResult = await exa.searchAndContents(`${companyDomain} careers page`, {
      context: true,
      excludeDomains: ["linkedin.com"],
      numResults: 5,
      text: true,
      type: "deep",
      livecrawl: "fallback",
    });

    if (careersResult.results.length > 0) {
      const careersUrl = careersResult.results[0].url;
      console.log(`    Found: ${careersUrl}`);
      careersPages.push({
        company: company.title || companyDomain,
        url: company.url,
        careersUrl: careersUrl,
      });
    } else {
      console.log(`    No careers page found for ${companyDomain}`);
    }
  }

  console.log(`\nFound ${careersPages.length} careers pages total.`);

  if (careersPages.length === 0) {
    console.log("No careers pages found. Exiting.");
    return;
  }

  // Apply to jobs either concurrently or sequentially based on config
  console.log(`\n${"=".repeat(50)}`);
  console.log(
    `Starting applications (${searchConfig.concurrent ? `concurrent, max ${searchConfig.maxConcurrentBrowsers} browsers` : "sequential"})...`,
  );
  console.log(`${"=".repeat(50)}`);

  let results: ApplicationResult[];

  if (searchConfig.concurrent) {
    // Run applications concurrently with limited parallelism
    const chunks: CareersPage[][] = [];
    for (let i = 0; i < careersPages.length; i += searchConfig.maxConcurrentBrowsers) {
      chunks.push(careersPages.slice(i, i + searchConfig.maxConcurrentBrowsers));
    }

    results = [];
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((page, idx) => applyToJob(page, results.length + idx)),
      );
      results.push(...chunkResults);
    }
  } else {
    // Run applications sequentially
    results = [];
    for (let i = 0; i < careersPages.length; i++) {
      const result = await applyToJob(careersPages[i], i);
      results.push(result);
    }
  }

  // Print summary
  console.log(`\n${"=".repeat(50)}`);
  console.log("APPLICATION SUMMARY");
  console.log(`${"=".repeat(50)}`);

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(
    `\nTotal: ${results.length} | Success: ${successful.length} | Failed: ${failed.length}\n`,
  );

  results.forEach((r, i) => {
    const status = r.success ? "[SUCCESS]" : "[FAILED]";
    console.log(`${i + 1}. ${status} ${r.company}`);
    console.log(`   URL: ${r.careersUrl}`);
    if (r.sessionUrl) {
      console.log(`   Session: ${r.sessionUrl}`);
    }
  });
}

main().catch((err) => {
  console.error("Error in Exa + Browserbase job application:", err);
  console.error("Common issues:");
  console.error("  - Check .env file has BROWSERBASE_API_KEY and EXA_API_KEY");
  console.error("  - Verify companies exist for the search query");
  console.error("  - Ensure careers pages are accessible");
  console.error("Docs: https://docs.stagehand.dev/v4/first-steps/introduction");
  process.exit(1);
});
