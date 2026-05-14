import "dotenv/config";
import {
  cleanTopic,
  errorMessage,
  handleDashboardRequest,
  makeIndexHtmlReader,
  makeTextFileReader,
  readBody,
  readTopic,
  runResearchForResponse,
  sendJson,
} from "./src/api-utils.js";

export const config = {
  maxDuration: 300,
};

const INDEX_HTML_URL = new URL("./public/index.html", import.meta.url);
const LOGO_SVG_URL = new URL("./public/browserbase-logo.svg", import.meta.url);
const readIndexHtml = makeIndexHtmlReader(INDEX_HTML_URL);
const readLogoSvg = makeTextFileReader(LOGO_SVG_URL);

export default async function handler(request: any, response: any): Promise<void> {
  return handleDashboardRequest(request, response, {
    protocol: "https",
    readIndexHtml,
    readLogoSvg,
    handleResearch: runResearchHandler,
  });
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
