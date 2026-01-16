package com.example;

import com.browserbase.api.client.StagehandClient;
import com.browserbase.api.client.okhttp.StagehandOkHttpClient;
import com.browserbase.api.core.JsonValue;
import com.browserbase.api.models.Action;
import com.browserbase.api.models.ModelConfig;
import com.browserbase.api.models.sessions.*;

import java.util.List;
import java.util.Map;

public class Main {
    private static final String SDK_VERSION = "3.0.6";

    public static void main(String[] args) {
        // Create client using environment variables:
        // BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, MODEL_API_KEY
        StagehandClient client = StagehandOkHttpClient.fromEnv();

        // Start a new browser session
        SessionStartResponse startResponse = client.sessions().start(
            SessionStartParams.builder()
                .modelName("openai/gpt-4o-mini")
                .xLanguage(SessionStartParams.XLanguage.TYPESCRIPT)
                .xSdkVersion(SDK_VERSION)
                .build()
        );

        String sessionId = startResponse.data().sessionId();
        System.out.println("Session started: " + sessionId);
        System.out.println("Watch live: https://www.browserbase.com/sessions/" + sessionId);

        try {
            // Navigate to Hacker News
            client.sessions().navigate(
                SessionNavigateParams.builder()
                    .id(sessionId)
                    .url("https://news.ycombinator.com")
                    .frameId("")
                    .xLanguage(SessionNavigateParams.XLanguage.TYPESCRIPT)
                    .xSdkVersion(SDK_VERSION)
                    .build()
            );
            System.out.println("Navigated to Hacker News");

            // Observe available actions on the page
            SessionObserveResponse observeResponse = client.sessions().observe(
                SessionObserveParams.builder()
                    .id(sessionId)
                    .instruction("find the link to view comments for the top post")
                    .xLanguage(SessionObserveParams.XLanguage.TYPESCRIPT)
                    .xSdkVersion(SDK_VERSION)
                    .build()
            );

            List<SessionObserveResponse.Data.Result> results = observeResponse.data().result();
            System.out.println("Found " + results.size() + " possible actions");

            if (results.isEmpty()) {
                System.out.println("No actions found");
                return;
            }

            // Act on the first action
            SessionObserveResponse.Data.Result result = results.get(0);
            Action action = JsonValue.from(result).convert(Action.class);
            System.out.println("Acting on: " + action.description());

            SessionActResponse actResponse = client.sessions().act(
                SessionActParams.builder()
                    .id(sessionId)
                    .input(action)
                    .xLanguage(SessionActParams.XLanguage.TYPESCRIPT)
                    .xSdkVersion(SDK_VERSION)
                    .build()
            );
            System.out.println("Act completed: " + actResponse.data().result().message());

            // Extract structured data from the page
            SessionExtractResponse extractResponse = client.sessions().extract(
                SessionExtractParams.builder()
                    .id(sessionId)
                    .instruction("extract the title and top comment from this page")
                    .schema(SessionExtractParams.Schema.builder()
                        .putAdditionalProperty("type", JsonValue.from("object"))
                        .putAdditionalProperty("properties", JsonValue.from(Map.of(
                            "title", Map.of(
                                "type", "string",
                                "description", "The title of the post"
                            ),
                            "topComment", Map.of(
                                "type", "string",
                                "description", "The text of the top comment"
                            ),
                            "author", Map.of(
                                "type", "string",
                                "description", "The username of the top commenter"
                            )
                        )))
                        .putAdditionalProperty("required", JsonValue.from(List.of("title")))
                        .build())
                    .xLanguage(SessionExtractParams.XLanguage.TYPESCRIPT)
                    .xSdkVersion(SDK_VERSION)
                    .build()
            );

            JsonValue extractedResult = extractResponse.data()._result();
            System.out.println("Extracted data: " + extractedResult);

            // Run autonomous agent
            SessionExecuteResponse executeResponse = client.sessions().execute(
                SessionExecuteParams.builder()
                    .id(sessionId)
                    .executeOptions(SessionExecuteParams.ExecuteOptions.builder()
                        .instruction("Navigate back to the main Hacker News page and find the newest post")
                        .maxSteps(5.0)
                        .build())
                    .agentConfig(SessionExecuteParams.AgentConfig.builder()
                        .model(ModelConfig.ofModelConfigObject(
                            ModelConfig.ModelConfigObject.builder()
                                .modelName("openai/gpt-4o-mini")
                                .apiKey(System.getenv("MODEL_API_KEY"))
                                .build()
                        ))
                        .cua(false)
                        .build())
                    .xLanguage(SessionExecuteParams.XLanguage.TYPESCRIPT)
                    .xSdkVersion(SDK_VERSION)
                    .build()
            );

            System.out.println("Agent result: " + executeResponse.data().result().message());
            System.out.println("Agent success: " + executeResponse.data().result().success());

        } finally {
            // End the browser session
            client.sessions().end(
                SessionEndParams.builder()
                    .id(sessionId)
                    .xLanguage(SessionEndParams.XLanguage.TYPESCRIPT)
                    .xSdkVersion(SDK_VERSION)
                    .build()
            );
            System.out.println("Session ended");
        }
    }
}
