"""Download images discovered in a live page with Stagehand V4."""

import asyncio
import base64
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from stagehand import Page, Stagehand, browserbase

load_dotenv()

MAX_IMAGES = int(os.environ.get("MAX_IMAGES", "10"))
OUTPUT_DIR = Path("images")
MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
}


class ImageUrls(BaseModel):
    urls: list[str] = Field(
        description="Absolute HTTP(S) image resource URLs from src or background-image values"
    )


def image_filename(url: str, mime_type: str, index: int) -> str:
    extension = MIME_TO_EXT.get(mime_type, "bin")
    segment = Path(urlparse(url).path).name
    stem = Path(segment).stem or f"image-{index}"
    safe_stem = re.sub(r"[^a-zA-Z0-9_-]", "_", stem)[:80]
    return f"{safe_stem}-{int(time.time() * 1000)}.{extension}"


async def browser_fetch(page: Page, url: str) -> tuple[bytes, str] | None:
    encoded_url = json.dumps(url)
    result = await page.evaluate(
        f"""(async () => {{
          try {{
            const response = await fetch({encoded_url});
            if (!response.ok) return null;
            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) return null;
            return await new Promise((resolve) => {{
              const reader = new FileReader();
              reader.onload = () => {{
                const dataUrl = String(reader.result);
                const comma = dataUrl.indexOf(',');
                resolve(comma === -1 ? null : {{
                  base64: dataUrl.slice(comma + 1),
                  mime_type: blob.type,
                }});
              }};
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            }});
          }} catch {{
            return null;
          }}
        }})()"""
    )
    if not isinstance(result, dict):
        return None
    encoded = result.get("base64")
    mime_type = result.get("mime_type")
    if not isinstance(encoded, str) or not isinstance(mime_type, str):
        return None
    return base64.b64decode(encoded), mime_type.split(";", 1)[0]


async def main() -> None:
    if len(sys.argv) < 2:
        raise RuntimeError("Usage: uv run python main.py <url>")
    target_url = sys.argv[1]
    api_key = os.environ.get("BROWSERBASE_API_KEY")
    if not api_key:
        raise RuntimeError("BROWSERBASE_API_KEY is required")

    browser = await browserbase.launch(api_key=api_key)
    try:
        stagehand = await Stagehand.create(
            browser=browser,
        )
        try:
            pages = await browser.context.pages()
            page = pages[0] if pages else await browser.context.new_page()
            await page.goto(target_url, wait_until="domcontentloaded", timeout=60_000)
            await page.wait_for_timeout(3_000)

            extracted = await stagehand.extract(
                (
                    "Extract all rendered image URLs on this page, including image src "
                    "attributes and background-image URLs. Return absolute HTTP(S) image "
                    "resource URLs, never accessibility-tree references such as 0-180."
                ),
                ImageUrls,
                page=page,
            )
            normalized = []
            for value in extracted.data.urls:
                candidate = str(value)
                if not candidate.lower().startswith(("http://", "https://")):
                    continue
                absolute = candidate
                if urlparse(absolute).scheme in {"http", "https"} and absolute not in normalized:
                    normalized.append(absolute)
            if not normalized:
                # Accessibility snapshots can omit decorative images. Inspect the exact DOM
                # shape only when semantic extraction returns no usable candidates at all.
                dom_urls = await page.evaluate(
                    r"""(() => {
                      const urls = new Set();
                      for (const image of Array.from(document.images)) {
                        if (image.currentSrc) urls.add(image.currentSrc);
                        if (image.src) urls.add(image.src);
                      }
                      for (const element of Array.from(document.querySelectorAll('[style]'))) {
                        const background = getComputedStyle(element).backgroundImage;
                        for (const match of background.matchAll(/url\(["']?(.*?)["']?\)/g)) {
                          if (match[1]) urls.add(new URL(match[1], document.baseURI).href);
                        }
                      }
                      return [...urls];
                    })()"""
                )
                if isinstance(dom_urls, list):
                    for value in dom_urls:
                        absolute = urljoin(target_url, str(value))
                        if (
                            urlparse(absolute).scheme in {"http", "https"}
                            and absolute not in normalized
                        ):
                            normalized.append(absolute)
            urls = normalized[:MAX_IMAGES]
            hostname = urlparse(target_url).hostname or "unknown"
            output_dir = OUTPUT_DIR / hostname
            output_dir.mkdir(parents=True, exist_ok=True)
            saved = 0
            failed = 0
            async with httpx.AsyncClient(follow_redirects=True, timeout=30) as http:
                for index, url in enumerate(urls):
                    try:
                        fetched = await browser_fetch(page, url)
                    except Exception:
                        fetched = None
                    if fetched is None:
                        try:
                            response = await http.get(url)
                            mime_type = response.headers.get("content-type", "").split(";", 1)[0]
                            fetched = (
                                (response.content, mime_type)
                                if response.is_success and mime_type.startswith("image/")
                                else None
                            )
                        except Exception:
                            fetched = None
                    if fetched is None:
                        failed += 1
                        continue

                    payload, mime_type = fetched
                    filename = image_filename(url, mime_type, index)
                    (output_dir / filename).write_bytes(payload)
                    print(f"Saved {filename} ({len(payload)} bytes)")
                    saved += 1

            print(f"Downloaded {saved} image(s); {failed} failed")
        finally:
            await stagehand.close()
    finally:
        await browser.close()
        print("Session closed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"Image download failed: {error}")
        print("Docs: https://docs.stagehand.dev/v4/first-steps/introduction")
        raise
