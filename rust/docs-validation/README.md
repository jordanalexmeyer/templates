# Stagehand + Browserbase: Documentation Validation

## AT A GLANCE

- Goal: Demonstrate how to automate package version validation and documentation checks using Stagehand and Browserbase.
- Real-world Workflow: Navigates to crates.io, searches for a package, and extracts structured version information.
- Structured Data Extraction: Uses JSON schema to extract crate name, latest version, and all available versions reliably.
- Docs → https://docs.rs/stagehand_sdk/latest/stagehand_sdk/all.html

## GLOSSARY

- navigate: Load a web page in the browser session
  Docs → https://docs.stagehand.dev/basics/navigate
- act: Execute actions on web pages using natural language instructions (type, click, etc.)
  Docs → https://docs.stagehand.dev/basics/act
- extract: Extract structured data from pages using JSON schema definitions
  Docs → https://docs.stagehand.dev/basics/extract
- streaming responses: Handle real-time event streams from Stagehand operations for better observability

## QUICKSTART

1. Ensure Rust and Cargo are installed (`rustc --version` and `cargo --version`)
2. Set required environment variables (create `.env` file or export):
   ```bash
   BROWSERBASE_API_KEY=your-api-key
   BROWSERBASE_PROJECT_ID=your-project-id
   MODEL_API_KEY=your-model-api-key
   ```
3. Build and run:
   ```bash
   cargo run --release
   ```

## EXPECTED OUTPUT

- Session initialization with Browserbase
- Navigation to crates.io
- Typing "stagehand_sdk" in the search box
- Clicking the search button
- Clicking on the stagehand_sdk crate link
- Structured data extraction displaying:
  - Crate name
  - Latest version
  - All available versions
- Session cleanup and termination
- Live session recording link displayed in console

## COMMON PITFALLS

- Missing Rust installation: Ensure Rust and Cargo are installed (`rustup install stable`)
- Missing environment variables: Verify BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, and MODEL_API_KEY are set
- Build errors: Run `cargo clean` and rebuild if dependencies fail to compile
- Network issues: Check internet connection and website accessibility
- Stream handling: Ensure proper async/await usage when processing streaming responses
- Session errors: Verify API keys are valid and project ID exists in Browserbase dashboard
- Find more information on your Browserbase dashboard -> https://www.browserbase.com/sign-in

## USE CASES

• Package version validation: Automate checking latest versions of dependencies across multiple package registries (crates.io, npm, PyPI).
• Documentation verification: Validate that documentation pages exist and contain expected content for CI/CD pipelines.
• Dependency auditing: Build automated workflows to check for security updates and version compatibility across projects.
• Release monitoring: Track new releases of packages and notify teams when updates are available.

## NEXT STEPS

• Multi-package validation: Extend to check multiple crates/packages in a single run from a configuration file.
• Version comparison: Compare extracted versions against project dependencies to detect outdated packages.
• Automated updates: Integrate with package managers to automatically update dependencies when new versions are detected.
• Cross-registry support: Add support for npm, PyPI, and other package registries with similar extraction workflows.

## HELPFUL RESOURCES

📚 Stagehand Rust Docs: https://docs.rs/stagehand_sdk/latest/stagehand_sdk/all.html
🎮 Browserbase: https://www.browserbase.com
💡 Try it out: https://www.browserbase.com/playground
🔧 Templates: https://www.browserbase.com/templates
📧 Need help? support@browserbase.com
💬 Discord: http://stagehand.dev/discord
