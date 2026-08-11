package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	stagehand "github.com/browserbase/stagehand/packages/sdk-go"
)

type storyDetails struct {
	Title      string `json:"title" jsonschema:"description=title of the Hacker News post"`
	TopComment string `json:"topComment" jsonschema:"description=text of the first visible comment"`
	Author     string `json:"author" jsonschema:"description=username of the first visible commenter"`
}

type newestStory struct {
	Title string `json:"title" jsonschema:"description=title of the newest visible story"`
}

type liveStoryLink struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

func main() {
	if err := run(context.Background()); err != nil {
		log.Fatal(err)
	}
}

func run(parent context.Context) (err error) {
	apiKey := os.Getenv("BROWSERBASE_API_KEY")
	if apiKey == "" {
		return errors.New("BROWSERBASE_API_KEY is required")
	}

	ctx, cancel := context.WithTimeout(parent, 2*time.Minute)
	defer cancel()

	browser, err := stagehand.LaunchBrowserbase(ctx, stagehand.BrowserbaseLaunchOptions{
		APIKey:  apiKey,
		Timeout: floatPointer(120),
	})
	if err != nil {
		return fmt.Errorf("launch Browserbase: %w", err)
	}
	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		err = errors.Join(err, browser.Close(cleanupCtx))
	}()

	client, err := stagehand.Create(ctx, stagehand.CreateOptions{Browser: browser})
	if err != nil {
		return fmt.Errorf("create Stagehand: %w", err)
	}
	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		err = errors.Join(err, client.Close(cleanupCtx))
	}()

	browserContext, err := browser.Context()
	if err != nil {
		return fmt.Errorf("get browser context: %w", err)
	}
	pages, err := browserContext.Pages(ctx)
	if err != nil {
		return fmt.Errorf("list pages: %w", err)
	}
	if len(pages) == 0 {
		return errors.New("Stagehand initialized without an active page")
	}
	page := pages[0]

	response, err := page.Goto(ctx, "https://news.ycombinator.com", nil)
	if err != nil {
		return fmt.Errorf("navigate to Hacker News: %w", err)
	}
	if response == nil || response.Status() != 200 {
		return fmt.Errorf("Hacker News returned an unexpected navigation response")
	}
	fmt.Println("Navigated to Hacker News")

	instruction := "Find the comments link for the top-ranked story"
	observed, err := client.Observe(ctx, &instruction, nil)
	if err != nil {
		return fmt.Errorf("observe comments link: %w", err)
	}
	if len(observed.Data) == 0 {
		return errors.New("observe returned no comments link")
	}
	fmt.Printf("Found %d possible comment actions\n", len(observed.Data))

	acted, err := client.Act(ctx, stagehand.ObservedAction(observed.Data[0]), nil)
	if err != nil {
		return fmt.Errorf("open comments: %w", err)
	}
	if !acted.Data.Success {
		return fmt.Errorf("open comments failed: %s", acted.Data.Message)
	}
	commentsURL, err := page.URL(ctx)
	if err != nil {
		return fmt.Errorf("read comments page URL: %w", err)
	}
	if !strings.HasPrefix(commentsURL, "https://news.ycombinator.com/item?id=") {
		return fmt.Errorf("observed action did not open a Hacker News comments page: %s", commentsURL)
	}

	details, err := stagehand.Extract[storyDetails](
		ctx,
		client,
		"Extract the post title and the first visible comment with its author",
		nil,
	)
	if err != nil {
		return fmt.Errorf("extract story details: %w", err)
	}
	if details.Data.Title == "" || details.Data.TopComment == "" || details.Data.Author == "" {
		return fmt.Errorf("story extraction returned incomplete data: %+v", details.Data)
	}
	actualTitle, err := page.Locator(".titleline > a").First().InnerText(ctx)
	if err != nil {
		return fmt.Errorf("read live story title: %w", err)
	}
	actualComment, err := page.Locator(".commtext").First().InnerText(ctx)
	if err != nil {
		return fmt.Errorf("read live top comment: %w", err)
	}
	actualAuthor, err := page.Locator("tr.comtr a.hnuser").First().InnerText(ctx)
	if err != nil {
		return fmt.Errorf("read live top-comment author: %w", err)
	}
	if normalize(details.Data.Title) != normalize(actualTitle) ||
		normalize(details.Data.TopComment) != normalize(actualComment) ||
		normalize(details.Data.Author) != normalize(actualAuthor) {
		return fmt.Errorf(
			"Stagehand extraction did not match the live page: extracted=%+v live={Title:%q TopComment:%q Author:%q}",
			details.Data,
			actualTitle,
			actualComment,
			actualAuthor,
		)
	}
	fmt.Printf("Top story: %s\n", details.Data.Title)
	fmt.Printf("Top comment by %s: %s\n", details.Data.Author, details.Data.TopComment)

	response, err = page.Goto(ctx, "https://news.ycombinator.com/newest", nil)
	if err != nil {
		return fmt.Errorf("navigate to newest stories: %w", err)
	}
	if response == nil || response.Status() != 200 {
		return fmt.Errorf("Hacker News newest page returned an unexpected response")
	}
	newest, err := stagehand.Extract[newestStory](
		ctx,
		client,
		"Extract the exact title of the first story in the newest stories list",
		nil,
	)
	if err != nil {
		return fmt.Errorf("extract newest story: %w", err)
	}
	if newest.Data.Title == "" {
		return fmt.Errorf("newest-story extraction returned incomplete data: %+v", newest.Data)
	}
	actualNewest, err := stagehand.EvaluateAs[liveStoryLink](
		ctx,
		page,
		`(() => {
          const link = document.querySelector(".titleline > a");
          return { title: link?.textContent?.trim() ?? "", url: link?.href ?? "" };
        })()`,
	)
	if err != nil {
		return fmt.Errorf("read live newest-story link: %w", err)
	}
	if actualNewest.Title == "" ||
		(!strings.HasPrefix(actualNewest.URL, "https://") && !strings.HasPrefix(actualNewest.URL, "http://")) {
		return fmt.Errorf(
			"newest-story DOM lookup returned incomplete data: title=%q url=%q",
			actualNewest.Title,
			actualNewest.URL,
		)
	}
	if !titlesMatch(newest.Data.Title, actualNewest.Title) {
		return fmt.Errorf(
			"Stagehand newest-story extraction did not match the live page: extracted=%q live=%q",
			newest.Data.Title,
			actualNewest.Title,
		)
	}
	fmt.Printf("Newest story: %s (%s)\n", newest.Data.Title, actualNewest.URL)
	fmt.Println("Verified the Hacker News observe, act, and extract workflow")
	return nil
}

func floatPointer(value float64) *float64 {
	return &value
}

func normalize(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

func titlesMatch(extracted string, live string) bool {
	if normalize(extracted) == normalize(live) {
		return true
	}
	if suffixStart := strings.LastIndex(extracted, " ("); suffixStart > 0 && strings.HasSuffix(extracted, ")") {
		return normalize(extracted[:suffixStart]) == normalize(live)
	}
	return false
}
