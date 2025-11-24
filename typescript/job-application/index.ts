import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import Browserbase from "@browserbasehq/sdk";
import { z } from "zod/v3";

// define JobInfo schema with zod:
const JobInfoSchema = z.object({
  url: z.string().url(),
  title: z.string(),
});

type JobInfo = z.infer<typeof JobInfoSchema>;

// Fetch project concurrency limit from Browserbase SDK (maxed at 5)
export async function getProjectConcurrency(): Promise<number> {
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });

  const project = await bb.projects.retrieve(process.env.BROWSERBASE_PROJECT_ID!);
  return Math.min(project.concurrency, 5);
}

// Generate random email
export function generateRandomEmail(): string {
  const randomString = Math.random().toString(36).substring(2, 10);
  return `agent-${randomString}@example.com`;
}

// Generate unique agent identifier
export function generateAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Semaphore implementation for concurrency control
export function createSemaphore(maxConcurrency: number) {
  let activeCount = 0;
  const queue: (() => void)[] = [];

  const semaphore = () =>
    new Promise<void>((resolve) => {
      if (activeCount < maxConcurrency) {
        activeCount++;
        resolve();
      } else {
        queue.push(resolve);
      }
    });

  const release = () => {
    activeCount--;
    if (queue.length > 0) {
      const next = queue.shift()!;
      activeCount++;
      next();
    }
  };

  return { semaphore, release };
}

// Apply to a single job
async function applyToJob(jobInfo: JobInfo, semaphore: () => Promise<void>, release: () => void) {
  await semaphore();

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    model: {
      modelName: "google/gemini-2.5-flash",
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    }
  });

  try {
    await stagehand.init();

    console.log(`[${jobInfo.title}] Session Started`);
    console.log(
      `[${jobInfo.title}] Watch live: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`
    );

    const page = stagehand.context.pages()[0];

    // Navigate to job URL
    await page.goto(jobInfo.url);
    console.log(`[${jobInfo.title}] Navigated to job page`);

    // Click on the specific job
    await stagehand.act(`click on ${jobInfo.title}`);
    console.log(`[${jobInfo.title}] Clicked on job`);

    // Fill out the form
    const agentId = generateAgentId();
    const email = generateRandomEmail();

    console.log(`[${jobInfo.title}] Agent ID: ${agentId}`);
    console.log(`[${jobInfo.title}] Email: ${email}`);

    // Fill agent identifier
    await stagehand.act(`type '${agentId}' into the agent identifier field`);

    // Fill contact endpoint
    await stagehand.act(`type '${email}' into the contact endpoint field`);

    // Fill deployment region
    await stagehand.act(`type 'us-west-2' into the deployment region field`);

    // Upload agent profile
    const [ uploadAction ] = await stagehand.observe("find the file upload button for agent profile");
    if (uploadAction) {
      const uploadSelector = uploadAction.selector;
      if (uploadSelector) {
        const fileInput = page.locator(uploadSelector);

        // Fetch resume from URL
        const resumeUrl = "https://agent-job-board.vercel.app/Agent%20Resume.pdf";
        const response = await fetch(resumeUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch resume: ${response.statusText}`);
        }
        const resumeBuffer = Buffer.from(await response.arrayBuffer());

        await fileInput.setInputFiles({
          name: "Agent Resume.pdf",
          mimeType: "application/pdf",
          buffer: resumeBuffer,
        });
        console.log(`[${jobInfo.title}] Uploaded resume from ${resumeUrl}`);
      }
    }

    // Select multi-region deployment
    await stagehand.act(`select 'Yes' for multi region deployment`);

    // Submit the form
    await stagehand.act(`click deploy agent button`);

    console.log(`[${jobInfo.title}] Application submitted successfully!`);

    await stagehand.close();
  } catch (error) {
    console.error(`[${jobInfo.title}] Error:`, error);
    await stagehand.close();
    throw error;
  } finally {
    release(); // Release the semaphore slot
  }
}

async function main() {
  // Get project concurrency limit
  const maxConcurrency = await getProjectConcurrency();
  console.log(`Executing with concurrency limit: ${maxConcurrency}`);

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    model: {
      modelName: "google/gemini-2.5-flash",
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    }
  });

  await stagehand.init();

  console.log(`Main Stagehand Session Started`);
  console.log(
    `Watch live: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`
  );

  const page = stagehand.context.pages()[0];

  // Navigate to localhost
  await page.goto("https://agent-job-board.vercel.app/");
  console.log("Navigated to agent-job-board.vercel.app");

  // Click on "View Jobs" button
  await stagehand.act("click on the view jobs button");
  console.log("Clicked on view jobs button");

  // Extract all jobs with titles using extract
  const jobsData = await stagehand.extract(
    "extract all job listings with their titles and URLs",
    z.array(JobInfoSchema)
  );

  console.log(`Found ${jobsData.length} jobs`);

  await stagehand.close();

  // Create semaphore with concurrency limit
  const { semaphore, release } = createSemaphore(maxConcurrency);

  // Apply to all jobs in parallel with concurrency control
  console.log(`Starting to apply to ${jobsData.length} jobs with max concurrency of ${maxConcurrency}`);

  const applicationPromises = jobsData.map((job) => applyToJob(job, semaphore, release));

  await Promise.all(applicationPromises);

  console.log("All applications completed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});