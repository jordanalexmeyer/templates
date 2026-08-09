// Stagehand + Browserbase: Company Address Finder - See README.md for full documentation

import "dotenv/config";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { Output, ToolLoopAgent, stepCountIs } from "ai";
import { z } from "zod/v4";

const COMPANY_NAMES = ["Browserbase", "Mintlify", "Wordware", "Reducto"];

// Values above 1 require enough Browserbase concurrency for one code-mode process per company.
const MAX_CONCURRENT = 1;

const companySchema = z.object({
  companyName: z.string(),
  homepageUrl: z.string(),
  termsOfServiceLink: z.string().nullable(),
  privacyPolicyLink: z.string().nullable(),
  address: z.string().nullable(),
});

type CompanyData = z.infer<typeof companySchema>;

async function processCompany(companyName: string): Promise<CompanyData> {
  const mcpClient = await createMCPClient({
    transport: new Experimental_StdioMCPTransport({
      command: "stagehand-codemode",
      stderr: "inherit",
    }),
  });

  try {
    const tools = await mcpClient.tools();
    if (!tools.code_execute) throw new Error("Stagehand code mode did not expose code_execute");

    const agent = new ToolLoopAgent({
      model: process.env.AGENT_MODEL ?? "anthropic/claude-sonnet-4.6",
      instructions:
        "You are a browser research agent. Use code_execute for every browser operation. Prefer deterministic page and locator APIs; use Stagehand extraction inside code_execute for semantic page reading. Verify that URLs belong to the requested company's official site.",
      tools,
      output: Output.object({ schema: companySchema }),
      stopWhen: stepCountIs(25),
    });

    console.log(`Processing ${companyName}...`);
    const result = await agent.generate({
      prompt: `Find the official homepage for ${JSON.stringify(companyName)}, then find its Terms of Service and Privacy Policy pages. Extract the physical mailing address from the Terms page, falling back to the Privacy page. Return null for a link or address only after checking the relevant official pages.`,
    });
    return result.output;
  } catch (error) {
    return {
      companyName,
      homepageUrl: "",
      termsOfServiceLink: null,
      privacyPolicyLink: null,
      address: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    await mcpClient.close();
  }
}

async function main() {
  const maxConcurrent = Math.max(1, MAX_CONCURRENT);
  const results: CompanyData[] = [];

  for (let index = 0; index < COMPANY_NAMES.length; index += maxConcurrent) {
    const batch = COMPANY_NAMES.slice(index, index + maxConcurrent);
    results.push(...(await Promise.all(batch.map(processCompany))));
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error("Application error:", error);
  console.error("Check BROWSERBASE_API_KEY and AI_GATEWAY_API_KEY in .env");
  process.exit(1);
});
