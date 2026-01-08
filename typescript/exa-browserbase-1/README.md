# Stagehand + Browserbase + Exa: Intelligent Job Application Automation

## AT A GLANCE

- **Goal**: Automate job application form filling with AI-powered decision-making that tailors responses to specific job descriptions.
- **Pattern Template**: Demonstrates the integration pattern of Exa (job discovery) + Browserbase (browser automation) + Stagehand Agent (intelligent form filling).
- **Workflow**: Uses Exa to find relevant job postings, Stagehand to extract job descriptions with structured schema, then an AI agent fills applications strategically based on the role requirements.
- **Intelligent Adaptation**: Agent analyzes job descriptions and crafts tailored responses for open-ended questions, cover letters, and "why this role" fields to maximize candidate alignment.
- **Decision-Making Agent**: Uses hybrid mode with Gemini 3 Flash to make smart choices about phrasing, emphasis, and presentation based on what the role requires.
- Docs → [Stagehand Agent](https://docs.stagehand.dev/basics/agent) | [Exa Search](https://docs.exa.ai/reference/search) | [Stagehand Extract](https://docs.stagehand.dev/basics/extract)

## GLOSSARY

- **agent**: autonomous AI that can plan, execute multi-step tasks, and make decisions without explicit instructions for each action. Uses hybrid mode to combine DOM and vision understanding.
  Docs → https://docs.stagehand.dev/basics/agent
- **extract**: pull structured data from web pages using Zod schemas. Returns typed JSON matching your schema definition.
  Docs → https://docs.stagehand.dev/basics/extract
- **Exa Search**: AI-powered search engine that finds and returns high-quality, relevant web content with metadata. Can filter by crawl/publish dates and find similar content.
  Docs → https://docs.exa.ai/reference/search
- **Schema-based extraction**: Define the exact structure you want extracted (job title, requirements, responsibilities) using Zod schemas and Stagehand returns matching JSON.
- **Hybrid mode**: Agent mode that combines DOM analysis and visual understanding for more reliable web automation across different page structures.
- **Tailored responses**: AI analyzes job requirements and customizes cover letters, motivation statements, and open-ended answers to highlight relevant candidate strengths.

## QUICKSTART

1. cd exa-browserbase-1
2. pnpm install
3. cp .env.example .env
4. Add required API keys to .env:
   - `BROWSERBASE_PROJECT_ID`
   - `BROWSERBASE_API_KEY`
   - `EXA_API_KEY`
   - Configure your Browserbase API key with OpenRouter/Anthropic
5. Update `applicationDetails` object with candidate information
6. Update `resumePath` to point to your PDF resume
7. pnpm start

## EXPECTED OUTPUT

- Initializes Stagehand session with Browserbase and displays live view link
- Navigates to target job application page (currently set to Nominal job posting)
- Extracts structured job description including title, requirements, responsibilities, benefits, and location
- Initializes AI agent with strategic system prompt for intelligent form filling
- Agent analyzes job description and candidate profile to determine optimal responses
- Fills out application form fields with tailored content that highlights relevant experience
- Crafts customized cover letter or motivation statement referencing specific job requirements
- Handles location/relocation questions strategically based on job type and candidate preferences
- Stops before submitting (for testing/review purposes)
- Outputs completion status and agent messages
- Closes session cleanly

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev/v3/first-steps/introduction
📚 Stagehand Agent: https://docs.stagehand.dev/basics/agent
📚 Exa AI Search: https://docs.exa.ai/reference/search
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord

