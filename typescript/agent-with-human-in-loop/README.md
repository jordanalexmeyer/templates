# Stagehand V4 + Browserbase: Human-in-the-Loop Workflow

## AT A GLANCE

- Goal: showcase an application-controlled V4 workflow that pauses for human input while filling a form.
- Interactive Loop: `observe()` discovers fields, known values are filled automatically, and the application asks the human for unknown values.
- Live Browser View: watch the agent work in real-time through an embedded Browserbase session.
- SSE Streaming: real-time activity log and status updates streamed to the frontend.
  Docs → https://docs.browserbase.com/features/sessions

## GLOSSARY

- askHuman: application logic that pauses execution and sends a question to the user, resuming once a response is provided
- session store: an in-memory map coordinating state between the SSE stream and the human response endpoint
- act: perform UI actions from a prompt (type, click, fill forms)
  Docs → https://docs.stagehand.dev/v4/basics/act
- observe: analyze a page and return selectors or action plans before executing
  Docs → https://docs.stagehand.dev/v4/basics/observe

## QUICKSTART

1.  cd agent-with-human-in-loop
2.  pnpm install
3.  Create a .env file and add your Browserbase credentials:
    BROWSERBASE_API_KEY=your-api-key
4.  pnpm dev
5.  Open http://localhost:3000 in your browser

## EXPECTED OUTPUT

- A form appears to enter an applicant's name and upload a resume
- On submit, a Browserbase session starts and the live browser view loads
- The V4 workflow navigates to a job application and fills known fields
- When an unknown field is encountered, it pauses and displays a question in the UI
- You type a response and the workflow continues with that value

## USE CASES

• Assisted form filling: automate job applications, account signups, or onboarding flows where some fields require human judgment.
• Approval workflows: let an agent prepare actions (purchases, submissions) but pause for human confirmation before committing.
• Supervised data entry: automate repetitive browser data entry while letting a human handle edge cases or ambiguous inputs.

## HELPFUL RESOURCES

📚 Stagehand Docs: https://docs.stagehand.dev
📚 Stagehand V4 Migration: https://docs.stagehand.dev/v4/migrations/v3
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
