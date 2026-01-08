import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { Exa } from "exa-js";
import { z } from "zod";

const applicationDetails = {
  name: "John Doe",
  email: "john.doe@example.com",
  linkedInUrl: "https://linkedin.com/in/johndoe",
  resumePath: "./Dummy_CV.pdf",
  currentLocation: "San Francisco, CA",
  willingToRelocate: true,
  requiresSponsorship: false,
  visaStatus: "",
  phone: "+1-555-123-4567",
  portfolioUrl: "https://johndoe.dev",
  coverLetter: "I am excited to apply for this position...",
};

async function main() {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 2,
    experimental: true,
    model: "google/gemini-2.5-pro",
  });

  const exa = new Exa(process.env.EXA_API_KEY);

  // const result = await exa.searchAndContents(
  //   "Find me jobs in san francisco for entry level software engineers, at browserbase or exa",
  //   {
  //     endCrawlDate: "2026-01-07T23:59:59.999Z",
  //     endPublishedDate: "2026-01-07T23:59:59.999Z",
  //     numResults: 5,
  //     startCrawlDate: "2025-12-08T00:00:00.000Z",
  //     startPublishedDate: "2025-12-08T00:00:00.000Z",
  //     text: true,
  //     type: "auto",
  //     userLocation: "US"
  //   }
  // );

  // const result = await exa.findSimilarAndContents(
  //   "https://jobs.ashbyhq.com/browserbase/7c431367-007f-4e7c-9a85-4c33024c5aab",
  //   { numResults: 10, text: true }
  // );

  // console.log(result.results[0].url);

  try {
    await stagehand.init();
    console.log(`Stagehand Session Started`);
    console.log(`Watch live: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`);
    // const testURL = "https://jobs.ashbyhq.com/browserbase/7c431367-007f-4e7c-9a85-4c33024c5aab";
    const testURL = "https://jobs.lever.co/nominal/c6f158d0-ef1d-484f-81cb-b5d29c34270e/apply";

    const page = stagehand.context.pages()[0];
    await page.goto(testURL);

    // Define the schema separately to avoid TypeScript type depth issues
    const jobDescriptionSchema = z.object({
      jobTitle: z.string().optional(),
      companyName: z.string().optional(),
      requirements: z.array(z.string()).optional(),
      responsibilities: z.array(z.string()).optional(),
      benefits: z.array(z.string()).optional(),
      location: z.string().optional(),
      workType: z.string().optional(),
      fullDescription: z.string().optional(),
    });

    const jobDescription = await stagehand.extract(
      "extract the full job description including title, requirements, responsibilities, and any important details about the role",
      jobDescriptionSchema,
    );

    const agent = stagehand.agent({
      // @ts-ignore, this is still experimental
      mode: "hybrid",
      model: "google/gemini-3-flash-preview",
      systemPrompt: `You are an intelligent job application assistant with decision-making power. 
    
    Your responsibilities:
    - If a job description is provided, analyze it carefully to understand what the company is looking for
    - Tailor your responses to align with the job requirements when available
    - For open-ended questions or text fields, craft thoughtful responses that highlight relevant experience/skills
    - For the cover letter or "why interested" fields, write a compelling response that:
      * References specific aspects of the job/company if known
      * Highlights how the candidate's background aligns with the role
      * Shows genuine professional interest
      * If no job description is available, write a general but enthusiastic response
    - For location/relocation questions, be strategic:
      * If the job is in the candidate's location, emphasize that
      * If the job is remote, highlight remote work capability
      * Use the willingToRelocate flag to guide your answer
    - For visa/sponsorship questions, answer honestly based on requiresSponsorship
    - For resume upload fields, upload the file from resumePath
    - Use the provided application details as the source of truth for factual information
    - Make intelligent decisions about how to phrase answers professionally
    - IMPORTANT: Do NOT click the submit button - this is for testing purposes only
    
    Think critically about each field and present the candidate in the best professional light.`,
    });

    const instruction =
      jobDescription.jobTitle || jobDescription.fullDescription
        ? `You are filling out a job application. Here is the job description that was found:

JOB DESCRIPTION:
${JSON.stringify(jobDescription, null, 2)}

CANDIDATE INFORMATION:
${JSON.stringify(applicationDetails, null, 2)}

YOUR TASK:
1. Carefully read and understand what this job is looking for
2. Fill out all form fields in a way that presents the candidate in the best light for THIS SPECIFIC role
3. For any open-ended questions, write tailored responses that:
   - Reference specific aspects of the job description
   - Highlight relevant skills/experience from the candidate's background
   - Show alignment between candidate and role
4. For standard fields (name, email, phone), use the exact information provided
5. For questions about motivation, interest, or "why this role", craft compelling, customized answers
6. Be strategic with your answers - think about what the hiring manager wants to see
7. Do NOT click the submit button

Remember: Your goal is to fill out this application in a way that maximizes the candidate's chances by showing strong alignment with this specific role.`
        : `You are filling out a job application. No detailed job description was found on this page.

CANDIDATE INFORMATION:
${JSON.stringify(applicationDetails, null, 2)}

YOUR TASK:
1. Fill out all form fields accurately using the candidate information provided
2. For standard fields (name, email, phone, LinkedIn, etc.), use the exact information provided
3. For any open-ended questions or text fields:
   - Write professional, thoughtful responses
   - Highlight the candidate's general strengths and qualifications
   - Express genuine interest and enthusiasm
   - Keep responses relevant to typical job application questions
4. For the cover letter field (if present), write a general but compelling introduction that highlights the candidate's background
5. For location/relocation questions, use the candidate's currentLocation and willingToRelocate values
6. For visa/sponsorship questions, answer based on the requiresSponsorship value
7. Do NOT click the submit button

Remember: Even without a job description, present the candidate professionally and enthusiastically.`;

    const result = await agent.execute({
      instruction,
      maxSteps: 50,
    });

    if (result.success) {
      console.log("Form filled successfully!");
      console.log("Agent message:", result.message);
    } else {
      console.log("Form filling may be incomplete");
      console.log("Agent message:", result.message);
    }

    // Handle CV/Resume upload if there's an upload field
    // console.log("\nChecking for CV/Resume upload option...");
    // try {
    //   const uploadActions = await stagehand.observe(
    //     "find the file upload button for resume or CV"
    //   );
    //
    //   if (uploadActions && uploadActions.length > 0) {
    //     const uploadAction = uploadActions[0];
    //     if (uploadAction.selector) {
    //       console.log("Found CV upload field, uploading file...");
    //       const fileInput = page.locator(uploadAction.selector);
    //
    //       // Upload the dummy CV from local path
    //       await fileInput.setInputFiles(applicationDetails.resumePath);
    //       console.log(`Uploaded CV from ${applicationDetails.resumePath}`);
    //     }
    //   } else {
    //     console.log("No CV upload field found on this form");
    //   }
    // } catch (uploadError) {
    //   console.log("No CV upload needed or upload already handled by agent");
    // }
  } catch (error) {
    console.error("Error during form filling:", error);
  } finally {
    await stagehand.close();
    console.log("Session closed successfully");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
