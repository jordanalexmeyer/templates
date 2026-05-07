import "dotenv/config";
import { readFile } from "node:fs/promises";
import { cleanTopic, errorMessage, readTopic, runResearchForResponse } from "./src/api-utils.js";

export const config = {
  maxDuration: 300,
};

const INDEX_HTML_URL = new URL("./public/index.html", import.meta.url);

let cachedIndexHtml: string | undefined;

export default async function handler(request: any, response: any): Promise<void> {
  const url = requestUrl(request);

  if (request.method === "OPTIONS") {
    return sendEmpty(response, 204);
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const html = await readIndexHtml();
    return sendHtml(response, 200, html);
  }

  if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === "/research" || url.pathname === "/api/research") {
    return runResearchHandler(request, response);
  }

  return sendJson(response, 404, { error: "Not found." });
}

async function runResearchHandler(request: any, response: any): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  if (!process.env.BROWSERBASE_API_KEY) {
    return sendJson(response, 500, { error: "Missing BROWSERBASE_API_KEY." });
  }

  const body = request.body ?? (await readBody(request));
  const topic = cleanTopic(readTopic(body));
  if (!topic) {
    return sendJson(response, 400, { error: "Enter a research topic." });
  }

  try {
    return sendJson(response, 200, await runResearchForResponse(topic, "vercel"));
  } catch (error) {
    return sendJson(response, 500, { error: errorMessage(error) });
  }
}

async function readIndexHtml(): Promise<string> {
  cachedIndexHtml ||= await readFile(INDEX_HTML_URL, "utf8");
  return cachedIndexHtml;
}

function requestUrl(request: any): URL {
  const host = request.headers?.host || "localhost";
  return new URL(request.url || "/", `https://${host}`);
}

async function readBody(request: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendHtml(response: any, statusCode: number, html: string): void {
  response.statusCode = statusCode;
  setCorsHeaders(response);
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(html);
}

function sendJson(response: any, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  setCorsHeaders(response);
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendEmpty(response: any, statusCode: number): void {
  response.statusCode = statusCode;
  setCorsHeaders(response);
  response.end();
}

function setCorsHeaders(response: any): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}
