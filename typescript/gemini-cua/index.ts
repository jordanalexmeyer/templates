// Stagehand code mode + Vercel AI SDK: Gemini browser agent example

import "dotenv/config";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { ToolLoopAgent, stepCountIs } from "ai";

const instruction = `Search for the next visible solar eclipse in North America and its expected date, and what about the one after that.`;

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
        "You are a Gemini browser agent. Use code_execute for all browser work. Prefer deterministic Stagehand V4 page and locator methods, and use Stagehand AI primitives inside code_execute only when they add value.",
      tools,
      stopWhen: stepCountIs(20),
    });

    console.log("Executing instruction:", instruction);
    const result = await agent.generate({ prompt: instruction });
    console.log(result.text);
  } finally {
    await mcpClient.close();
  }
}

main().catch((error) => {
  console.error("Error in Gemini browser agent example:", error);
  console.error("Check BROWSERBASE_API_KEY and AI_GATEWAY_API_KEY in .env");
  process.exit(1);
});
