# Stagehand + Browserbase: Job Application Automation

Stagehand is the SDK for browser agents.

This template uses Stagehand V4 to discover every role on a public test job board, fill each application with unique test data, upload a PDF resume, submit it, and verify the confirmation shown by the site.

## Run

```bash
cp .env.example .env
uv sync
uv run python main.py
```

Set `BROWSERBASE_API_KEY` in `.env`. `MAX_CONCURRENCY` defaults to `2`; set `MAX_JOBS` to a positive number when you want a bounded test run.

Expected output includes the number of discovered jobs, a verified submission line for every application, and a final successful-submission count. Any failed upload, missing confirmation, or partial batch makes the process exit nonzero.

Docs: https://docs.stagehand.dev/v4/first-steps/introduction
