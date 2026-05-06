import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { runResearchTask } from "./research.js";

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const INDEX_HTML_URL = new URL("../public/index.html", import.meta.url);

let cachedIndexHtml: string | undefined;
let activeRun = false;

const server = createServer(async (request, response) => {
  try {
    const url = requestUrl(request);

    if (request.method === "OPTIONS") {
      return sendEmpty(response, 204);
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return sendHtml(response, 200, await readIndexHtml());
    }

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      return sendJson(response, 200, { ok: true });
    }

    if (url.pathname === "/research" || url.pathname === "/api/research") {
      return handleResearch(request, response);
    }

    return sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    return sendJson(response, 500, { error: errorMessage(error) });
  }
});

server.listen(PORT, () => {
  console.log(`bb research engine dashboard listening on http://localhost:${PORT}`);
});

async function handleResearch(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  if (activeRun) {
    return sendJson(response, 409, { error: "A research run is already in progress." });
  }

  if (!process.env.BROWSERBASE_API_KEY) {
    return sendJson(response, 500, { error: "Missing BROWSERBASE_API_KEY." });
  }

  const topic = cleanTopic(readTopic(await readBody(request)));
  if (!topic) {
    return sendJson(response, 400, { error: "Enter a research topic." });
  }

  activeRun = true;
  try {
    const startedAt = Date.now();
    const result = await runResearchTask({
      topic,
      runId: `web-${Date.now()}`,
    });
    const latestQuality = result.traces[result.traces.length - 1]?.qualityEval;

    return sendJson(response, 200, {
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
    });
  } catch (error) {
    return sendJson(response, 500, { error: errorMessage(error) });
  } finally {
    activeRun = false;
  }
}

async function readIndexHtml(): Promise<string> {
  cachedIndexHtml ||= await readFile(INDEX_HTML_URL, "utf8");
  return cachedIndexHtml;
}

function requestUrl(request: IncomingMessage): URL {
  const host = request.headers.host || "localhost";
  return new URL(request.url || "/", `http://${host}`);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readTopic(body: string): string {
  if (!body) return "";
  try {
    const parsed = JSON.parse(body) as { topic?: unknown };
    return typeof parsed.topic === "string" ? parsed.topic : "";
  } catch {
    const params = new URLSearchParams(body);
    return params.get("topic") || "";
  }
}

function cleanTopic(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  response.statusCode = statusCode;
  setCorsHeaders(response);
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  setCorsHeaders(response);
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendEmpty(response: ServerResponse, statusCode: number): void {
  response.statusCode = statusCode;
  setCorsHeaders(response);
  response.end();
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
