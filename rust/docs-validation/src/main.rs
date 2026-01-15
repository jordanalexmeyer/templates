use anyhow::Result;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use stagehand_sdk::{
    ActResponseEvent, ExtractResponseEvent, Model, NavigateResponseEvent, Stagehand,
    TransportChoice, V3Options,
};
use std::collections::HashMap;

/// Extracted version information from crates.io
#[derive(Debug, Serialize, Deserialize)]
struct CrateVersions {
    crate_name: String,
    latest_version: String,
    all_versions: Vec<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load environment variables from .env file if present
    dotenvy::dotenv().ok();

    // Connect to Stagehand API using REST transport
    let mut stagehand = Stagehand::connect(TransportChoice::default_rest()).await?;

    // Start a new browser session
    let opts = V3Options {
        model: Some(Model::String("openai/gpt-4o-mini".to_string())),
        ..Default::default()
    };

    stagehand.start(opts).await?;

    let session_id = stagehand
        .session_id()
        .expect("Session should be initialized")
        .to_string();

    println!("Session started: {}", session_id);
    println!(
        "Watch live: https://www.browserbase.com/sessions/{}",
        session_id
    );

    // Ensure we clean up the session on exit (even on error)
    let result = run_automation(&mut stagehand).await;

    // Always try to end the session
    if let Err(e) = stagehand.end().await {
        eprintln!("Warning: Failed to end session: {}", e);
    } else {
        println!("Session ended");
    }

    result
}

async fn run_automation(stagehand: &mut Stagehand) -> Result<()> {
    // Navigate to crates.io (better for version info than docs.rs)
    println!("\n=== Navigating to crates.io ===");
    let mut nav_stream = stagehand.navigate("https://crates.io", None, None).await?;

    while let Some(item) = nav_stream.next().await {
        match item {
            Ok(response) => {
                if let Some(NavigateResponseEvent::Success(true)) = response.event {
                    println!("Navigated to crates.io");
                }
            }
            Err(e) => {
                eprintln!("Navigation error: {}", e);
                return Err(e.into());
            }
        }
    }

    // Search for stagehand_sdk - Step 1: Type in search box
    println!("\n=== Typing 'stagehand_sdk' in search box ===");
    let mut act_stream = stagehand
        .act(
            "Type 'stagehand_sdk' in the search box",
            None,
            HashMap::new(),
            None,
            None,
        )
        .await?;

    while let Some(item) = act_stream.next().await {
        match item {
            Ok(response) => {
                if let Some(event) = response.event {
                    match event {
                        ActResponseEvent::Success(success) => {
                            println!("Typing completed: success={}", success);
                        }
                        ActResponseEvent::Log(log) => {
                            if !log.message.is_empty() {
                                println!("[type] {}", log.message);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Typing error: {}", e);
                return Err(e.into());
            }
        }
    }

    // Search for stagehand_sdk - Step 2: Click the search button
    println!("\n=== Clicking magnifying glass to search ===");
    let mut act_stream = stagehand
        .act(
            "Click the magnifying glass button to search",
            None,
            HashMap::new(),
            None,
            None,
        )
        .await?;

    while let Some(item) = act_stream.next().await {
        match item {
            Ok(response) => {
                if let Some(event) = response.event {
                    match event {
                        ActResponseEvent::Success(success) => {
                            println!("Search completed: success={}", success);
                        }
                        ActResponseEvent::Log(log) => {
                            if !log.message.is_empty() {
                                println!("[search] {}", log.message);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Search error: {}", e);
                return Err(e.into());
            }
        }
    }

    // Click on the stagehand_sdk crate to go to its page
    println!("\n=== Clicking on stagehand_sdk crate ===");
    let mut act_stream = stagehand
        .act(
            "Click on the stagehand_sdk crate link in the search results",
            None,
            HashMap::new(),
            None,
            None,
        )
        .await?;

    while let Some(item) = act_stream.next().await {
        match item {
            Ok(response) => {
                if let Some(ActResponseEvent::Success(success)) = response.event {
                    println!("Clicked on crate: success={}", success);
                }
            }
            Err(e) => {
                eprintln!("Click error: {}", e);
                return Err(e.into());
            }
        }
    }

    // Extract version information from the crate page
    println!("\n=== Extracting version information ===");
    let schema = json!({
        "type": "object",
        "properties": {
            "crate_name": {
                "type": "string",
                "description": "The name of the crate"
            },
            "latest_version": {
                "type": "string",
                "description": "The latest/current version number shown prominently on the page"
            },
            "all_versions": {
                "type": "array",
                "items": { "type": "string" },
                "description": "All available version numbers listed on the page"
            }
        },
        "required": ["crate_name", "latest_version", "all_versions"]
    });

    let mut extract_stream = stagehand
        .extract(
            "Extract the crate name, the latest version number, and all available version numbers from this crates.io page",
            schema,
            None,
            None,
            None,
            None,
        )
        .await?;

    while let Some(item) = extract_stream.next().await {
        match item {
            Ok(response) => {
                if let Some(event) = response.event {
                    match event {
                        ExtractResponseEvent::DataJson(json_str) => {
                            println!("\n========================================");
                            println!("STAGEHAND_SDK VERSION INFO:");
                            println!("========================================");

                            if let Ok(versions) = serde_json::from_str::<CrateVersions>(&json_str) {
                                println!("Crate: {}", versions.crate_name);
                                println!("Latest Version: {}", versions.latest_version);
                                println!("All Versions: {:?}", versions.all_versions);
                            } else {
                                // Try parsing as raw JSON
                                if let Ok(data) =
                                    serde_json::from_str::<serde_json::Value>(&json_str)
                                {
                                    println!(
                                        "Crate: {}",
                                        data["crate_name"].as_str().unwrap_or("unknown")
                                    );
                                    println!(
                                        "Latest Version: {}",
                                        data["latest_version"].as_str().unwrap_or("unknown")
                                    );
                                    if let Some(versions) = data["all_versions"].as_array() {
                                        let version_strs: Vec<&str> =
                                            versions.iter().filter_map(|v| v.as_str()).collect();
                                        println!("All Versions: {:?}", version_strs);
                                    }
                                } else {
                                    println!("Raw data: {}", json_str);
                                }
                            }
                            println!("========================================\n");
                        }
                        ExtractResponseEvent::Log(log) => {
                            if !log.message.is_empty() {
                                println!("[extract] {}", log.message);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Extract error: {}", e);
                return Err(e.into());
            }
        }
    }

    Ok(())
}
