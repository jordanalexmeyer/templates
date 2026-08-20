// Stagehand code mode + Vercel AI SDK: Gemini browser agent example

import "dotenv/config";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { ToolLoopAgent, stepCountIs } from "ai";

const today = new Date().toISOString().slice(0, 10);
const instruction = `As of ${today}, search live sources for the next visible solar eclipse in North America and its expected date, then the one after that. Cite the source URLs you actually opened.`;

const childEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

async function main() {
  const mcpClient = await createMCPClient({
    transport: new Experimental_StdioMCPTransport({
      command: "stagehand-codemode",
      env: { ...childEnv, STAGEHAND_MODEL_NAME: "google/gemini-3-flash-preview" },
      stderr: "inherit",
    }),
  });

  try {
    const tools = await mcpClient.tools();
    if (!tools.code_execute) throw new Error("Stagehand code mode did not expose code_execute");

    const agent = new ToolLoopAgent({
      model: process.env.AGENT_MODEL ?? "google/gemini-3-flash-preview",
      instructions:
        "You are a browser research agent powered by Gemini. Use code_execute for all browser work. Prefer Stagehand act, extract, and observe for semantic work; use page APIs only for exact navigation, mechanics, or verification when needed for correctness. Return source URLs for factual claims, and never cite a URL unless you navigated directly to it in the browser.",
      tools,
      prepareStep: ({ stepNumber }) =>
        stepNumber >= 10
          ? {
              activeTools: [],
              toolChoice: "none",
              instructions:
                "Return the evidence-backed answer now. Include only source URLs you opened directly. Do not call another tool.",
            }
          : undefined,
      stopWhen: stepCountIs(12),
    });

    console.log("Executing instruction:", instruction);
    const result = await agent.generate({ prompt: instruction });
    console.log(result.text);
    const sourceUrls = new Set(result.text.match(/https?:\/\/\S+/g) ?? []);
    const futureYears = new Set(
      [...result.text.matchAll(/\b20\d{2}\b/g)]
        .map((match) => Number(match[0]))
        .filter((year) => year >= Number(today.slice(0, 4))),
    );
    if (!result.text.trim() || sourceUrls.size < 2 || futureYears.size < 2) {
      throw new Error("Agent did not return two future eclipse dates with opened source URLs");
    }
  } finally {
    await mcpClient.close();
  }
}

main().catch((error) => {
  console.error("Error in Gemini browser agent example:", error);
  console.error("Check BROWSERBASE_API_KEY and AI_GATEWAY_API_KEY in .env");
  process.exit(1);
});
