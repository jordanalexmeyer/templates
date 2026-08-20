// Stagehand + Browserbase + Exa: agentic job search and application

import "dotenv/config";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { Output, ToolLoopAgent, stepCountIs } from "ai";
import { Exa } from "exa-js";
import { resolve } from "node:path";
import { z } from "zod/v4";

const childEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

const applicationDetails = {
  name: "John Doe",
  email: "john.doe@example.com",
  linkedInUrl: "https://linkedin.com/in/johndoe",
  resumePath: resolve("Dummy_CV.pdf"),
  currentLocation: "San Francisco, CA",
  willingToRelocate: true,
  requiresSponsorship: false,
  visaStatus: "",
  phone: "+1-555-123-4567",
  portfolioUrl: "https://johndoe.dev",
  coverLetter: "I am excited to apply for this position...",
};

function readPositiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined) return fallback;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer; received ${JSON.stringify(rawValue)}`);
  }
  return value;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}

const searchConfig = {
  companyQuery: process.env.COMPANY_QUERY ?? "AI startups in SF currently hiring",
  numCompanies: readPositiveInteger("NUM_COMPANIES", 5),
  concurrent: process.env.CONCURRENT === "true",
  maxConcurrentBrowsers: readPositiveInteger("MAX_CONCURRENT_BROWSERS", 5),
};

interface CareersPage {
  company: string;
  careersUrl: string;
}

interface ApplicationResult {
  company: string;
  careersUrl: string;
  success: boolean;
  message: string;
}

const applicationReviewSchema = z.object({
  roleFound: z.boolean(),
  applicationOpened: z.boolean(),
  jobTitle: z.string().nullable(),
  jobUrl: z.string().nullable(),
  fieldsFilled: z.array(z.string()),
  outstandingFields: z.array(z.string()),
  providedFieldStatus: z.object({
    name: z.object({ present: z.boolean(), filled: z.boolean() }),
    email: z.object({ present: z.boolean(), filled: z.boolean() }),
    phone: z.object({ present: z.boolean(), filled: z.boolean() }),
    linkedIn: z.object({ present: z.boolean(), filled: z.boolean() }),
    resume: z.object({ present: z.boolean(), filled: z.boolean() }),
    portfolio: z.object({ present: z.boolean(), filled: z.boolean() }),
    coverLetter: z.object({ present: z.boolean(), filled: z.boolean() }),
    currentLocation: z.object({ present: z.boolean(), filled: z.boolean() }),
    relocation: z.object({ present: z.boolean(), filled: z.boolean() }),
    sponsorship: z.object({ present: z.boolean(), filled: z.boolean() }),
    visaStatus: z.object({ present: z.boolean(), filled: z.boolean() }),
  }),
  resumeUploaded: z.boolean(),
  summary: z.string().min(1),
});

async function applyToJob(careersPage: CareersPage, index: number): Promise<ApplicationResult> {
  const prefix = `[${index + 1}/${searchConfig.numCompanies}] ${careersPage.company}:`;
  const mcpClient = await createMCPClient({
    transport: new Experimental_StdioMCPTransport({
      command: "stagehand-codemode",
      env: childEnv,
      stderr: "inherit",
    }),
  });

  try {
    const tools = await mcpClient.tools();
    if (!tools.code_execute) throw new Error("Stagehand code mode did not expose code_execute");

    const agent = new ToolLoopAgent({
      model: process.env.AGENT_MODEL ?? "anthropic/claude-sonnet-4.6",
      instructions:
        "You are a careful job-application browser agent. Use code_execute for all browser work and use no more than 14 code_execute calls. Inspect before acting, prefer deterministic locators, use Stagehand AI primitives inside code_execute for semantic work, never invent applicant facts, and never submit an application unless explicitly instructed. The resumePath is a real file path accessible to code_execute. Fill fields whose answers map exactly to the applicant record; reserve human review for information or consequential choices that are genuinely missing or ambiguous.",
      tools,
      output: Output.object({ schema: applicationReviewSchema }),
      prepareStep: ({ stepNumber }) =>
        stepNumber >= 15
          ? {
              activeTools: [],
              toolChoice: "none",
              instructions:
                "Stop browser work and return the structured application review now. Report truthfully whether a role and its application were reached, which fields were filled, whether the resume was uploaded, and what remains. For every providedFieldStatus entry, set present to whether that form field existed and filled to whether you filled it from the applicant record; an absent field must be { present: false, filled: false }. Do not call another tool.",
            }
          : undefined,
      stopWhen: stepCountIs(30),
    });

    console.log(`${prefix} starting code-mode agent`);
    const result = await agent.generate({
      prompt: `Open ${careersPage.careersUrl}. Choose the first relevant open role, read its requirements, open its application, and fill every field you can from this applicant record:\n${JSON.stringify(applicationDetails, null, 2)}\nUpload the resume from ${JSON.stringify(applicationDetails.resumePath)} when a file input is present. Stop before final submission and summarize what remains for human review.`,
    });
    const review = result.output;
    if (!review) {
      throw new Error("Agent returned no structured application review");
    }
    console.log(`${prefix} review`, JSON.stringify(review));
    if (
      !review.roleFound ||
      !review.applicationOpened ||
      !review.jobTitle?.trim() ||
      !parseHttpUrl(review.jobUrl ?? "")
    ) {
      throw new Error(`No verified application was opened: ${review.summary}`);
    }
    const unfilledPresentFields = Object.entries(review.providedFieldStatus)
      .filter(([, status]) => status.present && !status.filled)
      .map(([field]) => field);
    if (!review.resumeUploaded || unfilledPresentFields.length > 0) {
      throw new Error(
        `Application review was incomplete: ${JSON.stringify({
          resumeUploaded: review.resumeUploaded,
          unfilledPresentFields,
        })}`,
      );
    }

    return {
      company: careersPage.company,
      careersUrl: careersPage.careersUrl,
      success: true,
      message: JSON.stringify(review),
    };
  } catch (error) {
    return {
      company: careersPage.company,
      careersUrl: careersPage.careersUrl,
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await mcpClient.close();
  }
}

async function main() {
  if (
    !process.env.BROWSERBASE_API_KEY ||
    !process.env.AI_GATEWAY_API_KEY ||
    !process.env.EXA_API_KEY
  ) {
    throw new Error("BROWSERBASE_API_KEY, AI_GATEWAY_API_KEY, and EXA_API_KEY are required");
  }

  const exa = new Exa(process.env.EXA_API_KEY);
  console.log(`Searching for companies: ${searchConfig.companyQuery}`);
  const companies = await exa.searchAndContents(searchConfig.companyQuery, {
    category: "company",
    text: true,
    type: "auto",
    livecrawl: "fallback",
    numResults: searchConfig.numCompanies,
  });

  const careersPages: CareersPage[] = [];
  for (const company of companies.results) {
    const companyName = company.title || parseHttpUrl(company.url)?.hostname;
    if (!companyName) continue;
    const homepageResults = await exa.searchAndContents(`${companyName} official homepage`, {
      context: true,
      excludeDomains: [
        "linkedin.com",
        "crunchbase.com",
        "pitchbook.com",
        "cbinsights.com",
        "builtin.com",
      ],
      numResults: 5,
      text: true,
      type: "deep",
      livecrawl: "fallback",
    });
    const homepage = homepageResults.results.find((result) => {
      return parseHttpUrl(result.url)?.protocol === "https:";
    });
    if (!homepage) continue;

    const homepageUrl = parseHttpUrl(homepage.url);
    if (!homepageUrl) continue;
    const domain = homepageUrl.hostname.replace(/^www\./, "");
    const careers = await exa.searchAndContents(`${companyName} ${domain} careers page`, {
      context: true,
      excludeDomains: ["linkedin.com"],
      numResults: 5,
      text: true,
      type: "deep",
      livecrawl: "fallback",
    });
    const companyTerms = companyName
      .replaceAll("-", " ")
      .split(/\s+/)
      .map((term) => term.toLowerCase())
      .filter((term) => term.length >= 4);
    const sameDomain = careers.results.filter((result) => {
      const host = parseHttpUrl(result.url)?.hostname.replace(/^www\./, "");
      if (!host) return false;
      return host === domain || host.endsWith(`.${domain}`);
    });
    const brandedAts = careers.results.filter((result) => {
      const parsedResultUrl = parseHttpUrl(result.url);
      if (!parsedResultUrl) return false;
      const searchable = `${result.title || ""} ${result.url}`.toLowerCase();
      const host = parsedResultUrl.hostname;
      return (
        companyTerms.some((term) => searchable.includes(term)) &&
        ["ashbyhq.com", "greenhouse.io", "lever.co", "smartrecruiters.com"].some((provider) =>
          host.includes(provider),
        )
      );
    });
    const directSameDomain = sameDomain.filter((result) =>
      ["ashby_jid=", "gh_jid=", "lever-origin="].some((marker) => result.url.includes(marker)),
    );
    const careerTermPattern =
      /\b(careers?|jobs?|open[- ]?roles?|join[- ]?us|work[- ]?with[- ]?us)\b/i;
    const sameDomainCareerPages = sameDomain.filter((result) =>
      careerTermPattern.test(`${result.title || ""} ${result.url}`),
    );
    const candidates = directSameDomain.length
      ? directSameDomain
      : brandedAts.length
        ? brandedAts
        : sameDomainCareerPages;
    if (candidates[0]) {
      careersPages.push({ company: companyName, careersUrl: candidates[0].url });
    }
  }
  if (careersPages.length === 0) {
    throw new Error("Exa returned no company careers pages");
  }

  const results: ApplicationResult[] = [];
  const batchSize = searchConfig.concurrent ? searchConfig.maxConcurrentBrowsers : 1;
  for (let index = 0; index < careersPages.length; index += batchSize) {
    const batch = careersPages.slice(index, index + batchSize);
    results.push(
      ...(await Promise.all(batch.map((page, offset) => applyToJob(page, index + offset)))),
    );
  }

  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter((result) => !result.success);
  if (failures.length > 0) {
    throw new Error(`${failures.length} of ${results.length} application reviews failed`);
  }
}

main().catch((error) => {
  console.error("Error in Exa + Browserbase job application:", error);
  console.error("Check BROWSERBASE_API_KEY, AI_GATEWAY_API_KEY, and EXA_API_KEY in .env");
  process.exit(1);
});
