require "bundler/setup"
require "stagehand"
require "dotenv/load"

SDK_VERSION = "3.0.6"

# Create client using environment variables
client = Stagehand::Client.new(
  browserbase_api_key: ENV["BROWSERBASE_API_KEY"],
  browserbase_project_id: ENV["BROWSERBASE_PROJECT_ID"],
  model_api_key: ENV["MODEL_API_KEY"]
)

# Start a new browser session
start_response = client.sessions.start(
  model_name: "openai/gpt-4o-mini",
  x_language: :typescript,
  x_sdk_version: SDK_VERSION
)

session_id = start_response.data.session_id
puts "Session started: #{session_id}"
puts "Watch live: https://www.browserbase.com/sessions/#{session_id}"

begin
  # Navigate to Hacker News
  client.sessions.navigate(
    session_id,
    url: "https://news.ycombinator.com",
    frame_id: "",
    x_language: :typescript,
    x_sdk_version: SDK_VERSION
  )
  puts "Navigated to Hacker News"

  # Observe available actions
  observe_response = client.sessions.observe(
    session_id,
    instruction: "find the link to view comments for the top post",
    x_language: :typescript,
    x_sdk_version: SDK_VERSION
  )

  actions = observe_response.data.result
  puts "Found #{actions.length} possible actions"

  if actions.empty?
    puts "No actions found"
    exit
  end

  # Act on the first action
  action = actions.first
  puts "Acting on: #{action.description}"

  act_response = client.sessions.act(
    session_id,
    input: action.to_h.merge(method: "click"),
    x_language: :typescript,
    x_sdk_version: SDK_VERSION
  )
  puts "Act completed: #{act_response.data.result[:message]}"

  # Extract structured data
  extract_response = client.sessions.extract(
    session_id,
    instruction: "extract the title and top comment from this page",
    schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title of the post"
        },
        top_comment: {
          type: "string",
          description: "The text of the top comment"
        },
        author: {
          type: "string",
          description: "The username of the top commenter"
        }
      },
      required: ["title"]
    },
    x_language: :typescript,
    x_sdk_version: SDK_VERSION
  )
  puts "Extracted data: #{extract_response.data.result}"

  # Run autonomous agent
  execute_response = client.sessions.execute(
    session_id,
    execute_options: {
      instruction: "Navigate back to the main Hacker News page and find the newest post",
      max_steps: 5
    },
    agent_config: {
      model: Stagehand::ModelConfig::ModelConfigObject.new(
        model_name: "openai/gpt-4o-mini",
        api_key: ENV["MODEL_API_KEY"]
      ),
      cua: false
    },
    x_language: :typescript,
    x_sdk_version: SDK_VERSION
  )
  puts "Agent result: #{execute_response.data.result[:message]}"
  puts "Agent success: #{execute_response.data.result[:success]}"

ensure
  # End the session
  client.sessions.end_(
    session_id,
    x_language: :typescript,
    x_sdk_version: SDK_VERSION
  )
  puts "Session ended"
end
