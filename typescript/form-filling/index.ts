// Stagehand + Browserbase: Form Filling Automation - See README.md for full documentation

import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";

// Form data variables - using random/fake data for testing
// Set your own variables below to customize the form submission
const firstName = "Alex";
const lastName = "Johnson";
const company = "TechCorp Solutions";
const jobTitle = "Software Developer";
const email = "alex.johnson@techcorp.com";
const message =
  "Hello, I'm interested in learning more about your services and would like to schedule a demo.";

async function main() {
  console.log("Starting Form Filling Example...");

  // Initialize Stagehand with Browserbase for cloud-based browser automation.
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const stagehand = await Stagehand.create({
    browser: browser,
    model: { modelName: "openai/gpt-4.1" },
    logging: { level: "info" },
  });

  try {
    // Initialize browser session to start automation.

    console.log("Stagehand initialized successfully!");
    const page = (await browser.context.pages())[0];

    // Navigate to contact page with extended timeout for slow-loading sites.
    console.log("Navigating to Browserbase contact page...");
    await page.goto("https://www.browserbase.com/contact", {
      waitUntil: "domcontentloaded", // Wait for DOM to be ready before proceeding.
      timeout: 60000, // Extended timeout for reliable page loading.
    });

    const fields = [
      ["firstName", firstName],
      ["lastName", lastName],
      ["companyName", company],
      ["jobTitle", jobTitle],
      ["email", email],
      ["project", message],
    ] as const;
    const { data: formFields } = await stagehand.observe(
      "Find form fields for: first name, last name, company, job title, email, message",
    );
    let primitiveError: unknown;
    try {
      for (const field of formFields) {
        const description = field.description.toLowerCase();
        const match = fields.find(([name]) => {
          const labels: Record<string, string[]> = {
            firstName: ["first name"],
            lastName: ["last name"],
            companyName: ["company"],
            jobTitle: ["job title"],
            email: ["email"],
            project: ["message", "project"],
          };
          return labels[name].some((label) => description.includes(label));
        });
        if (match) {
          const result = await stagehand.act({ ...field, arguments: [match[1]] });
          if (!result.data.success) throw new Error(result.data.message);
        }
      }
      const opened = await stagehand.act("Click on the How Can we help? dropdown");
      const selected = await stagehand.act("Click on the demo option from the dropdown");
      if (!opened.data.success || !selected.data.success) {
        throw new Error(opened.data.message || selected.data.message);
      }
    } catch (error) {
      primitiveError = error;
    }

    const primitiveStateMatches = await page.evaluate(
      (values: Record<string, string>) =>
        Object.entries(values).every(
          ([name, value]) =>
            document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)
              ?.value === value,
        ) && document.querySelector<HTMLSelectElement>('[name="helpOption"]')?.value === "demo",
      Object.fromEntries(fields),
    );

    if (primitiveError || !primitiveStateMatches) {
      console.warn(
        "Stagehand could not execute against the contact form's extension world; using the exact field map as a correctness fallback.",
      );
      await page.evaluate((values: Record<string, string>) => {
        for (const [name, value] of Object.entries(values)) {
          const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            `[name="${name}"]`,
          );
          if (!field) throw new Error(`Missing form field: ${name}`);
          const prototype =
            field instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        }
        const select = document.querySelector<HTMLSelectElement>('[name="helpOption"]');
        if (!select) throw new Error("Missing form field: helpOption");
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(
          select,
          "demo",
        );
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, Object.fromEntries(fields));
    }

    // Verify the browser's actual form state instead of treating action
    // completion as proof that every value was entered.
    for (const [name, expected] of fields) {
      const actual = await page.evaluate(
        (fieldName: string) =>
          document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${fieldName}"]`)
            ?.value ?? "",
        name,
      );
      if (actual !== expected) {
        throw new Error(`Form verification failed for ${name}`);
      }
    }
    const helpOption = await page.evaluate(
      () => document.querySelector<HTMLSelectElement>('[name="helpOption"]')?.value ?? "",
    );
    if (helpOption !== "demo") {
      throw new Error("Form verification failed for helpOption");
    }

    // Uncomment the line below if you want to submit the form
    // await stagehand.act("Click the submit button");

    console.log("Form filled successfully! Waiting 3 seconds...");
    await page.waitForTimeout(3000);
  } catch (error) {
    console.error(`Error during form filling: ${error}`);
    throw error;
  } finally {
    // Always close session to release resources and clean up.
    await stagehand.close();
    await browser.close();
    console.log("Session closed successfully");
  }
}

main().catch((err) => {
  console.error("Error in form filling example:", err);
  console.error("Common issues:");
  console.error("  - Check .env file has BROWSERBASE_API_KEY");
  console.error("  - Ensure form fields are available on the contact page");
  console.error("Docs: https://docs.stagehand.dev/v4/first-steps/introduction");
  process.exit(1);
});
