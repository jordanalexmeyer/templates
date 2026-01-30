import "dotenv/config";
import { Stagehand, type ConstructorParams, type LogLine } from "@browserbasehq/stagehand";
import chalk from "chalk";
import boxen from "boxen";

/**
 * Stagehand + Browserbase: Credit Karma Mortgage Rates with Caching & Variables
 *
 * This template demonstrates:
 * - Using Stagehand's caching feature for faster subsequent runs
 * - Parameterizing actions with variables for flexible automation
 * - Automating Credit Karma mortgage rate comparisons
 *
 * See README.md for full documentation
 */

// Configuration
const StagehandConfig: ConstructorParams = {
  env: "BROWSERBASE",
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  debugDom: undefined,
  headless: false,
  logger: (message: LogLine) => console.log(logLineToString(message)),
  domSettleTimeoutMs: 30_000,
  browserbaseSessionCreateParams: {
    projectId: process.env.BROWSERBASE_PROJECT_ID!
  },
  model: "google/gemini-2.5-flash",
  cacheDir: "credit-karma-cache", // Enable caching for faster subsequent runs
};

// User configuration - modify these values as needed
const USER_CONFIG = {
  creditScore: "Above 760",
  zipcode: "94109",
  loanBalance: "500000",
  homeValue: "1000000",
  cashOut: "200000",
};

/**
 * Format log lines for console output
 */
function logLineToString(logLine: LogLine): string {
  const HIDE_AUXILIARY = true;

  try {
    const timestamp = logLine.timestamp || new Date().toISOString();
    if (logLine.auxiliary?.error) {
      return `${timestamp}::[stagehand:${logLine.category}] ${logLine.message}\n ${logLine.auxiliary.error.value}\n ${logLine.auxiliary.trace.value}`;
    }

    return `${timestamp}::[stagehand:${logLine.category}] ${logLine.message} ${
      logLine.auxiliary && !HIDE_AUXILIARY ? JSON.stringify(logLine.auxiliary) : ""
    }`;
  } catch (error) {
    console.error(`Error logging line:`, error);
    return "error logging line";
  }
}

/**
 * Main automation function
 */
async function run() {
  const stagehand = new Stagehand({
    ...StagehandConfig,
  });
  await stagehand.init();

  // Display Browserbase session link
  if (StagehandConfig.env === "BROWSERBASE" && stagehand.browserbaseSessionID) {
    console.log(
      boxen(
        `View this session live in your browser: \n${chalk.blue(
          `https://browserbase.com/sessions/${stagehand.browserbaseSessionID}`
        )}`,
        {
          title: "Browserbase",
          padding: 1,
          margin: 3,
        }
      )
    );
  }

  const page = stagehand.context.pages()[0];

  try {
    console.log(chalk.cyan("\n🏠 Starting Credit Karma mortgage rate automation...\n"));

    // Navigate to Credit Karma mortgage rates page
    await page.goto("https://www.creditkarma.com/home-loans/mortgage-rates");
    console.log(chalk.green("✓ Successfully navigated to Credit Karma mortgage rates page"));

    // Click on Refinance tab
    await stagehand.act("click on the Refinance tab");
    await page.waitForTimeout(2000);
    console.log(chalk.green("✓ Selected Refinance tab"));

    // Select credit score using variables
    await stagehand.act("select %creditScore% from the credit score dropdown", {
      variables: { creditScore: USER_CONFIG.creditScore },
    });
    await page.waitForTimeout(1000);
    console.log(chalk.green(`✓ Selected credit score: ${USER_CONFIG.creditScore}`));

    // Input ZIP code using variables
    await stagehand.act("input the ZIP code as %zipcode%", {
      variables: { zipcode: USER_CONFIG.zipcode },
    });
    await page.waitForTimeout(1000);
    console.log(chalk.green(`✓ Entered ZIP code: ${USER_CONFIG.zipcode}`));

    // Input loan balance using variables
    await stagehand.act("input the loan balance as %loanBalance%", {
      variables: { loanBalance: USER_CONFIG.loanBalance },
    });
    await page.waitForTimeout(1000);
    console.log(chalk.green(`✓ Entered loan balance: $${USER_CONFIG.loanBalance}`));

    // Input estimated home value using variables
    await stagehand.act("input the estimated home value as %homeValue%", {
      variables: { homeValue: USER_CONFIG.homeValue },
    });
    await page.waitForTimeout(1000);
    console.log(chalk.green(`✓ Entered home value: $${USER_CONFIG.homeValue}`));

    // Input cash-out amount using variables
    await stagehand.act("input the cash-out amount as %cashOut%", {
      variables: { cashOut: USER_CONFIG.cashOut },
    });
    await page.waitForTimeout(1000);
    console.log(chalk.green(`✓ Entered cash-out amount: $${USER_CONFIG.cashOut}`));

    // Click Get my rates button
    await stagehand.act("click on the 'Get my rates' button");
    console.log(chalk.green("✓ Clicked 'Get my rates' button"));

    // Wait for results to load
    await page.waitForTimeout(5000);
    console.log(chalk.green("\n✓ Mortgage rates loaded successfully!\n"));

    console.log(
      boxen(
        `${chalk.bold("Summary")}\n\n` +
          `Credit Score: ${chalk.cyan(USER_CONFIG.creditScore)}\n` +
          `ZIP Code: ${chalk.cyan(USER_CONFIG.zipcode)}\n` +
          `Loan Balance: ${chalk.cyan("$" + USER_CONFIG.loanBalance)}\n` +
          `Home Value: ${chalk.cyan("$" + USER_CONFIG.homeValue)}\n` +
          `Cash Out: ${chalk.cyan("$" + USER_CONFIG.cashOut)}`,
        {
          title: "Credit Karma Refinance Query",
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "green",
        }
      )
    );
  } catch (error) {
    console.error(chalk.red("\n✗ Navigation failed:"), error);
    // Take a screenshot on failure
    await page.screenshot({
      path: "error-screenshot.png",
      fullPage: true,
    });
    console.log(chalk.yellow("📸 Screenshot saved to error-screenshot.png"));
    throw error;
  } finally {
    await stagehand.close();
  }

  console.log(
    `\n🤘 Thanks for using Stagehand! Create an issue if you have any feedback: ${chalk.blue(
      "https://github.com/browserbase/stagehand/issues/new"
    )}\n`
  );
}

run().catch(console.error);
