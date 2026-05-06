import "dotenv/config";
import { runResearchTask } from "../src/research.js";

export const config = {
  maxDuration: 300,
};

type ResearchResponse = {
  topic: string;
  durationSec: number;
  report: Awaited<ReturnType<typeof runResearchTask>>["report"];
  verification: Awaited<ReturnType<typeof runResearchTask>>["verification"];
  qualityEval?: Awaited<ReturnType<typeof runResearchTask>>["traces"][number]["qualityEval"];
  sources: Array<{
    id: number;
    title: string;
    url: string;
    domain: string;
    sourceType: string;
    wordCount: number;
    reliabilityScore: number;
    score: number;
  }>;
  artifacts: {
    workspace: string;
    markdown: string;
    json: string;
  };
};

export default async function handler(request: any, response: any): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.BROWSERBASE_API_KEY) {
    return response.status(500).json({ error: "Missing BROWSERBASE_API_KEY." });
  }

  const topic = cleanTopic(readTopic(request.body));
  if (!topic) {
    return response.status(400).json({ error: "Enter a research topic." });
  }

  try {
    const startedAt = Date.now();
    const result = await runResearchTask({
      topic,
      runId: `vercel-${Date.now()}`,
    });
    const latestQuality = result.traces[result.traces.length - 1]?.qualityEval;
    const payload: ResearchResponse = {
      topic: result.topic,
      durationSec: Math.round((Date.now() - startedAt) / 1000),
      report: result.report,
      verification: result.verification,
      qualityEval: latestQuality,
      sources: result.evidence.map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        domain: source.domain,
        sourceType: source.sourceType,
        wordCount: source.wordCount,
        reliabilityScore: source.reliabilityScore,
        score: Number(source.score.toFixed(3)),
      })),
      artifacts: {
        workspace: result.workspace.root,
        markdown: result.paths.markdownPath,
        json: result.paths.jsonPath,
      },
    };

    return response.status(200).json(payload);
  } catch (error) {
    return response.status(500).json({ error: errorMessage(error) });
  }
}

function readTopic(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as { topic?: unknown };
      return typeof parsed.topic === "string" ? parsed.topic : "";
    } catch {
      return "";
    }
  }
  if (typeof body === "object" && "topic" in body) {
    const topic = (body as { topic?: unknown }).topic;
    return typeof topic === "string" ? topic : "";
  }
  return "";
}

function cleanTopic(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
