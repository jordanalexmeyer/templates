import type { runResearchTask } from "./research.js";

type ResearchRunResult = Awaited<ReturnType<typeof runResearchTask>>;

export type ResearchResponse = {
  topic: string;
  durationSec: number;
  report: ResearchRunResult["report"];
  verification: ResearchRunResult["verification"];
  qualityEval?: ResearchRunResult["traces"][number]["qualityEval"];
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

export async function runResearchForResponse(topic: string, runIdPrefix: string): Promise<ResearchResponse> {
  const { runResearchTask } = await import("./research.js");
  const startedAt = Date.now();
  const result = await runResearchTask({
    topic,
    runId: `${runIdPrefix}-${Date.now()}`,
  });

  return buildResearchResponse(result, startedAt);
}

function buildResearchResponse(result: ResearchRunResult, startedAt: number): ResearchResponse {
  const latestQuality = result.traces[result.traces.length - 1]?.qualityEval;

  return {
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
}

export function readTopic(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as { topic?: unknown };
      return typeof parsed.topic === "string" ? parsed.topic : "";
    } catch {
      const params = new URLSearchParams(body);
      return params.get("topic") || "";
    }
  }
  if (typeof body === "object" && "topic" in body) {
    const topic = (body as { topic?: unknown }).topic;
    return typeof topic === "string" ? topic : "";
  }
  return "";
}

export function cleanTopic(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
