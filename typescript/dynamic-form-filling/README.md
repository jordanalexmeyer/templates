# Stagehand V4 + Browserbase: Dynamic Form Filling

## AT A GLANCE

- Goal: automate form filling through explicit, reviewable Stagehand V4 `act()` calls.
- Semantic Matching: each action uses a natural-language instruction to select the closest matching field or option.
- V4 Control Flow: application code owns the multi-step workflow because V4 has no `agent()` orchestrator.
- Docs → https://docs.stagehand.dev/v4/basics/act

## GLOSSARY

- act: perform one model-backed browser action from a natural-language instruction
  Docs → https://docs.stagehand.dev/v4/basics/act
- semantic matching: selecting form options based on meaning rather than exact text match

## QUICKSTART

1. pnpm install
2. cp .env.example .env
3. Add your Browserbase API key to .env (BROWSERBASE_API_KEY)
4. Customize the `tripDetails` variable in index.ts with your own form data
5. Update the form URL if using a different form
6. pnpm start

## EXPECTED OUTPUT

- Initializes Stagehand session with Browserbase
- Navigates to the target form
- Explicit V4 actions fill fields and choose dropdown/checkbox options semantically
- Application code submits the form after all steps complete
- Closes session cleanly

## COMMON PITFALLS

- Dependency install errors: ensure pnpm install completed
- Missing credentials: verify .env contains BROWSERBASE_API_KEY
- Form not submitting: verify the form URL is accessible and form fields are visible
- Semantic matching issues: make the individual `act()` instruction more specific
- Find more information on your Browserbase dashboard -> https://www.browserbase.com/sign-in

## USE CASES

• Dynamic form automation: Fill out forms with variable data from natural language descriptions without hardcoding field mappings.
• Survey and questionnaire automation: Automatically complete surveys, feedback forms, or registration forms with intelligent option selection.
• Multi-step form workflows: Handle complex multi-page forms where the agent navigates between steps and maintains context.
• Form testing and validation: Test form behavior with different data sets to ensure proper validation and error handling.

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev/v4/first-steps/introduction
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
