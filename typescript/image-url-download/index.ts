// Stagehand + Browserbase: Image URL Download - See README.md for full documentation
//
// Uses Stagehand extract() to find all image URLs on a page, then downloads each
// image through the browser's proxied fetch() — inheriting session cookies, headers,
// and the Browserbase proxy. Works for any image format (JPG, PNG, WebP, etc.).

import "dotenv/config";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";
import fs from "fs";
import path from "path";

// ============= CONFIGURATION =============

// Maximum number of images to download per run.
// Increase this if you need more images, or set MAX_IMAGES in your .env.
const MAX_IMAGES = parseInt(process.env.MAX_IMAGES ?? "10", 10) || 10;

// Directory (relative to where the script is run) where images are saved.
const OUTPUT_DIR = "./images";

// =========================================

// Maps MIME types to file extensions for the most common image formats.
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

/**
 * Derive a safe filename from an image URL and its detected MIME type.
 * Takes the last path segment for the base name, uses the MIME type for the
 * extension (more reliable than trusting the URL), and appends a timestamp
 * so repeated runs never overwrite earlier downloads.
 */
function imageFilename(url: string, mimeType: string, index: number): string {
  const ext = MIME_TO_EXT[mimeType] ?? "bin";
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    // Strip any existing extension — we'll use the one from the actual MIME type.
    const base = segment.replace(/\.[^.]+$/, "") || `image-${index}`;
    // Sanitize to filesystem-safe characters.
    const safe = base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    return `${safe}-${Date.now()}.${ext}`;
  } catch {
    return `image-${index}-${Date.now()}.${ext}`;
  }
}

async function main(): Promise<void> {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error("Usage: npm start <url>");
    console.error("Example: npm start https://www.browserbase.com");
    process.exit(1);
  }

  console.log(`Image URL Download — target: ${targetUrl}`);
  console.log(`Max images: ${MAX_IMAGES} | Output: ${OUTPUT_DIR}/<hostname>/\n`);

  // Initialize Stagehand with Browserbase for cloud-based browser automation.
  const browser = await browserbase.launch({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const stagehand = await Stagehand.create({
    browser: browser,
    model: { modelName: "google/gemini-2.5-flash" },
    logging: { level: "info" },
  });

  try {
    // Initialize browser session to start automation.

    console.log("Stagehand initialized successfully!");
    const page = (await browser.context.pages())[0];

    // Many modern sites keep analytics and streaming requests open indefinitely, so
    // wait for DOM readiness and then allow client-rendered images a short settle period.
    console.log(`\nNavigating to ${targetUrl}...`);
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000, // Extended timeout for reliable page loading.
    });
    await page.waitForTimeout(3000);

    console.log("Extracting image URLs from page...");
    const { data: extractedUrls } = await stagehand.extract(
      "Extract the absolute HTTP(S) source URLs of all rendered images on this page, including image src attributes and background-image URLs. Return actual image resource URLs, never accessibility-tree references such as 0-180.",
      z.object({
        urls: z
          .array(z.string())
          .describe("Absolute HTTP(S) image resource URLs from src or background-image values"),
      }),
    );
    let allUrls = extractedUrls.urls;
    if (allUrls.length === 0) {
      // Accessibility snapshots can omit decorative images. Use the exact DOM
      // shape only when semantic extraction returns no candidates at all.
      allUrls = (await page.evaluate(() => {
        const urls = new Set<string>();
        for (const image of Array.from(document.images)) {
          if (image.currentSrc) urls.add(image.currentSrc);
          if (image.src) urls.add(image.src);
        }
        for (const element of Array.from(document.querySelectorAll<HTMLElement>("[style]"))) {
          const background = getComputedStyle(element).backgroundImage;
          for (const match of background.matchAll(/url\(["']?(.*?)["']?\)/g)) {
            if (match[1]) urls.add(new URL(match[1], document.baseURI).href);
          }
        }
        return [...urls];
      })) as string[];
    }

    // Normalize root-relative paths against the target page, then deduplicate
    // and filter unsupported URL schemes before applying the limit.
    const normalizedUrls = allUrls.flatMap((url) => {
      try {
        return [new URL(url, targetUrl).href];
      } catch {
        return [];
      }
    });
    const uniqueUrls = [...new Set(normalizedUrls)].filter((url) => {
      const { protocol } = new URL(url);
      return protocol === "https:" || protocol === "http:";
    });
    console.log(`Found ${uniqueUrls.length} unique image URL(s)`);

    const urls = uniqueUrls.slice(0, MAX_IMAGES);
    if (uniqueUrls.length > MAX_IMAGES) {
      console.log(`Capping at ${MAX_IMAGES} (adjust MAX_IMAGES to change this)`);
    }

    if (urls.length === 0) {
      throw new Error("No image URLs found on the page");
    }

    // Create a subdirectory scoped to the target site's hostname (e.g. images/browserbase.com/).
    const hostname = new URL(targetUrl).hostname;
    const outputDir = path.join(OUTPUT_DIR, hostname);
    fs.mkdirSync(outputDir, { recursive: true });

    let saved = 0;
    let failed = 0;

    console.log(`\nDownloading ${urls.length} image(s) via browser fetch...\n`);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      process.stdout.write(`[${i + 1}/${urls.length}] ${url} → `);

      // Fetch the image through the browser's proxied connection.
      // Running fetch() inside page.evaluate() means it inherits the Browserbase
      // proxy and all active session cookies — no CORS or auth issues.
      // FileReader.readAsDataURL() is the most reliable browser-native way to
      // encode binary data as base64, and it also gives us the real MIME type.
      // Wrap the entire page.evaluate() call — not just the code inside it — so that
      // CDP-level errors (execution context destroyed, timeout, page navigation) are
      // caught per-image and don't abort the rest of the download loop.
      let result: { base64: string; mimeType: string } | null = null;
      try {
        result = await page.evaluate(async (imgUrl: string) => {
          try {
            const res = await fetch(imgUrl);
            if (!res.ok) return null;
            const blob = await res.blob();
            if (!blob.type.startsWith("image/")) return null;
            return await new Promise<{ base64: string; mimeType: string } | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                const comma = dataUrl.indexOf(",");
                if (comma === -1) {
                  resolve(null);
                  return;
                }
                const prefix = dataUrl.slice(0, comma); // e.g. "data:image/png;base64"
                const base64 = dataUrl.slice(comma + 1);
                const mimeMatch = prefix.match(/data:([^;]+)/);
                resolve({ base64, mimeType: mimeMatch?.[1] ?? "application/octet-stream" });
              };
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
          } catch {
            return null;
          }
        }, url);
      } catch (err) {
        console.log(`FAILED (${err instanceof Error ? err.message : err}, skipping)`);
        failed++;
        continue;
      }

      // Browser fetch obeys CORS. Public CDN images sometimes omit CORS headers,
      // so fall back to a server-side fetch when no authenticated browser state is needed.
      if (!result) {
        try {
          const response = await fetch(url);
          const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
          if (response.ok && mimeType.startsWith("image/")) {
            result = {
              base64: Buffer.from(await response.arrayBuffer()).toString("base64"),
              mimeType,
            };
          }
        } catch {
          // The common failure path below records this URL as skipped.
        }
      }

      if (!result) {
        console.log("FAILED (skipping)");
        failed++;
        continue;
      }

      const filename = imageFilename(url, result.mimeType, i);
      const filepath = path.join(outputDir, filename);
      const buffer = Buffer.from(result.base64, "base64");
      try {
        fs.writeFileSync(filepath, buffer);
      } catch (err) {
        console.log(`FAILED (write error: ${err instanceof Error ? err.message : err}, skipping)`);
        failed++;
        continue;
      }
      console.log(`saved as ${filename} (${buffer.length} bytes)`);
      saved++;
    }

    if (saved === 0) {
      throw new Error(`No images were downloaded (${failed} failed)`);
    }
    console.log(`\nDone! ${saved} saved, ${failed} failed → ${outputDir}/`);
  } catch (error) {
    console.error("Error during image download:", error);
    throw error;
  } finally {
    // Always close session to release resources and clean up.
    try {
      await stagehand.close();
    } catch (error) {
      console.warn("Stagehand cleanup warning:", error);
    }
    try {
      await browser.close();
    } catch (error) {
      console.warn("Browser cleanup warning:", error);
    }
    console.log("Session closed successfully");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  console.error("Common issues:");
  console.error("  - Check .env file has BROWSERBASE_API_KEY");
  console.error("  - Verify the target URL is accessible");
  console.error("Docs: https://docs.stagehand.dev/v4/first-steps/introduction");
  process.exit(1);
});
