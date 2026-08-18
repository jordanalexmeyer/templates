// Stagehand + Browserbase + Exa: agentic job search and application

import "dotenv/config";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { ToolLoopAgent, stepCountIs } from "ai";
import { Exa } from "exa-js";

const childEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

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
  companyQuery: process.env.COMPANY_QUERY ?? "AI startups in SF",
  numCompanies: readPositiveInteger("NUM_COMPANIES", 5),
  concurrent: process.env.CONCURRENT !== "false",
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
        "You are a careful job-application browser agent. Use code_execute for all browser work. Inspect before acting, prefer deterministic locators, use Stagehand AI primitives inside code_execute for semantic work, never invent applicant facts, and never submit an application unless explicitly instructed.",
      tools,
      stopWhen: stepCountIs(30),
    });

    console.log(`${prefix} starting code-mode agent`);
    const result = await agent.generate({
      prompt: `Open ${careersPage.careersUrl}. Choose the first relevant open role, read its requirements, open its application, and fill every field you can from this applicant record:\n${JSON.stringify(applicationDetails, null, 2)}\nUpload the resume from ${JSON.stringify(applicationDetails.resumePath)} when a file input is present. Stop before final submission and summarize what remains for human review.`,
    });
    if (!result.text.trim()) {
      throw new Error("Agent returned no application review summary");
    }

    return {
      company: careersPage.company,
      careersUrl: careersPage.careersUrl,
      success: true,
      message: result.text,
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
    const candidates = directSameDomain.length
      ? directSameDomain
      : brandedAts.length
        ? brandedAts
        : sameDomain;
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
