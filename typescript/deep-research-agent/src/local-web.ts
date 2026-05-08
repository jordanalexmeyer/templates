import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  cleanTopic,
  errorMessage,
  handleDashboardRequest,
  makeIndexHtmlReader,
  readBody,
  readTopic,
  runResearchForResponse,
  sendJson,
} from "./api-utils.js";

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const INDEX_HTML_URL = new URL("../public/index.html", import.meta.url);
const readIndexHtml = makeIndexHtmlReader(INDEX_HTML_URL);

let activeRun = false;

const server = createServer((request, response) =>
  handleDashboardRequest(request, response, {
    protocol: "http",
    readIndexHtml,
    handleResearch,
  }),
);

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
    return sendJson(response, 200, await runResearchForResponse(topic, "web"));
  } catch (error) {
    return sendJson(response, 500, { error: errorMessage(error) });
  } finally {
    activeRun = false;
  }
}
