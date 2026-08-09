// Stagehand + Browserbase: Human-in-the-Loop Agent — core agent logic
// This module runs an explicit Stagehand V4 workflow that fills out a job application,
// pausing to ask the human whenever it encounters fields it can't fill alone.
// Communication with the frontend happens via Server-Sent Events (SSE).

import { Browserbase } from "@browserbasehq/sdk";
import { browserbase, Stagehand, type StagehandBrowser } from "@browserbasehq/stagehand";
import { z } from "zod/v4";
import { createSession, setQuestion, completeSession, errorSession } from "./session-store";
import { createReadStream, writeFileSync, mkdtempSync, unlinkSync } from "fs";
import { join, basename } from "path";
import { tmpdir } from "os";

// SSE event helper — writes a Server-Sent Event to the stream
function sendEvent(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  event: string,
  data: Record<string, unknown>,
) {
  const encoder = new TextEncoder();
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return writer.write(encoder.encode(msg));
}

export async function runAgent(params: {
  firstName: string;
  lastName: string;
  resumeBase64: string;
  resumeFileName: string;
  id: string; // internal correlation ID
  writer: WritableStreamDefaultWriter<Uint8Array>;
}) {
  const { firstName, lastName, resumeBase64, resumeFileName, id, writer } = params;
  let resumePath: string | undefined;
  let browser: StagehandBrowser | undefined;
  let stagehand: Stagehand | undefined;
  let extensionId: string | undefined;
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });

  try {
    // --- Browserbase session setup ---
    const stagehandEntry = import.meta.resolve("@browserbasehq/stagehand");
    const extension = await bb.extensions.create({
      file: createReadStream(new URL("./assets/stagehand-extension.zip", stagehandEntry)),
    });
    extensionId = extension.id;

    const session = await bb.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      extensionId,
      browserSettings: {
        viewport: { width: 1288, height: 711 },
      },
    });

    const debugLinks = await bb.sessions.debug(session.id);
    const debuggerUrl = debugLinks.debuggerFullscreenUrl;

    // Register in session store
    createSession(id, debuggerUrl, session.id);

    // Send the session info to the frontend immediately
    await sendEvent(writer, "session", {
      id,
      debuggerUrl,
      browserbaseSessionId: session.id,
    });

    // --- Stagehand setup ---
    browser = await browserbase.connect({
      apiKey: process.env.BROWSERBASE_API_KEY!,
      sessionId: session.id,
      extensionId,
    });
    stagehand = await Stagehand.create({
      browser: browser,
      model: { modelName: "anthropic/claude-sonnet-4-5-20250929" },
      logging: { level: "info" },
    });

    const page = (await browser.context.pages())[0];
    await page.goto("https://bb-template-site.vercel.app/");

    // Save resume to a temp file so Playwright can upload it
    const tmpDir = mkdtempSync(join(tmpdir(), "hitl-"));
    resumePath = join(tmpDir, basename(resumeFileName));
    writeFileSync(resumePath, Buffer.from(resumeBase64, "base64"));

    await sendEvent(writer, "status", { message: "Navigating to job listing..." });

    const askHuman = async (question: string): Promise<string> => {
      await sendEvent(writer, "question", { id, question });
      const response = await new Promise<string>((resolve) => {
        setQuestion(id, question, resolve);
      });
      await sendEvent(writer, "status", { message: "Received your response, continuing..." });
      return response;
    };

    // V4 has no agent() orchestrator, so the workflow is explicit and reviewable.
    await stagehand.act("Open the careers page");
    const { data: jobs } = await stagehand.extract(
      "Extract the available job titles",
      z.object({ jobs: z.array(z.string()) }),
    );
    const selectedJob = await askHuman(
      `Which position would you like to apply for? Available roles: ${jobs.jobs.join(", ")}`,
    );
    await stagehand.act(`Open the job listing for ${selectedJob}`);
    await stagehand.act("Open the application form");

    const { data: fields } = await stagehand.observe(
      "Find every empty text, email, phone, textarea, select, checkbox, and radio field in the application form",
    );
    for (const field of fields) {
      const description = field.description.toLowerCase();
      let value: string;
      if (description.includes("first name")) value = firstName;
      else if (description.includes("last name")) value = lastName;
      else {
        value = await askHuman(`What should I enter for: ${field.description}?`);
      }
      await stagehand.act({ ...field, arguments: [value] });
    }

    if (!resumePath) throw new Error("No resume file available to upload");
    await page.locator('input[type="file"]').first().setInputFiles(resumePath);
    await sendEvent(writer, "status", { message: `Uploaded resume: ${resumeFileName}` });
    await stagehand.act("Submit the application");

    completeSession(id);
    await sendEvent(writer, "complete", {
      success: true,
      message: "Application submitted",
      sessionReplayUrl: `https://browserbase.com/sessions/${session.id}`,
    });

    // Keep the session open briefly so the user can see the final state
    await new Promise((resolve) => setTimeout(resolve, 10000));
  } catch (err) {
    errorSession(id);
    await sendEvent(writer, "error", {
      message: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    await stagehand?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    if (extensionId) {
      await bb.extensions
        .delete(extensionId, { headers: { "Content-Type": null } })
        .catch(() => undefined);
    }
    // Clean up temp resume file (in finally so it's removed even on error)
    if (resumePath)
      try {
        unlinkSync(resumePath);
      } catch {
        /* ignore */
      }
    await writer.close();
  }
}
