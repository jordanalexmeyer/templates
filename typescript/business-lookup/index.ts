// Business Lookup with a bring-your-own agent - See README.md for full documentation

import "dotenv/config";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { Output, ToolLoopAgent, stepCountIs } from "ai";
import { z } from "zod/v4";

const businessName = "Jalebi Street";

const businessSchema = z.object({
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
});

async function main() {
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
        "You are a browser agent. Use code_execute for all browser work. Prefer deterministic page and locator APIs, and use Stagehand act, observe, or extract inside code_execute only when semantic browser intelligence is useful.",
      tools,
      output: Output.object({ schema: businessSchema }),
      stopWhen: stepCountIs(20),
    });

    console.log(`Searching for business: ${businessName}`);
    const result = await agent.generate({
      prompt: `Open the San Francisco Registered Business Lookup at https://data.sfgov.org/stories/s/Registered-Business-Lookup/k6sk-2y6w/ and find the record for ${JSON.stringify(businessName)}. Return all requested fields. Use null when a field is not present.`,
    });

    console.log("Business Information:");
    console.log(JSON.stringify(result.output, null, 2));
  } finally {
    await mcpClient.close();
    console.log("Stagehand code-mode session closed successfully");
  }
}

main().catch((error) => {
  console.error("Error in business lookup:", error);
  console.error("Check BROWSERBASE_API_KEY and AI_GATEWAY_API_KEY in .env");
  process.exit(1);
});
