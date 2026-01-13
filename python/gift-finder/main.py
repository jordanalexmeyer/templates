# Stagehand + Browserbase: AI-Powered Gift Finder - See README.md for full documentation

import asyncio
import json
import os

from dotenv import load_dotenv
from openai import OpenAI
from stagehand import AsyncStagehand

load_dotenv()

# ============= CONFIGURATION =============
CONFIG = {
    "recipient": "Friend",
    "description": "loves cooking and trying new recipes",
}
# =========================================

openai_client = OpenAI()


async def generate_search_queries(recipient: str, description: str) -> list[str]:
    print(f"Generating search queries for {recipient}...")

    response = await asyncio.to_thread(
        openai_client.chat.completions.create,
        model="gpt-4.1",
        messages=[
            {
                "role": "user",
                "content": f"""Generate exactly 3 short gift search queries (1-2 words each) for finding gifts for a {recipient.lower()} who is described as: "{description}".

IMPORTANT: Assume they already have the basic necessities related to their interests. Focus on:
- Complementary items that enhance their hobbies
- Thoughtful accessories or upgrades
- Related but unexpected items
- Premium or unique versions of things they might not buy themselves

AVOID obvious basics like "poker set" for poker players, "dumbbells" for fitness enthusiasts, etc.

Examples for "loves cooking":
spice rack
chef knife
herb garden

Return ONLY the search terms, one per line, no dashes, bullets, or numbers. Just the plain search terms:""",
            }
        ],
        max_completion_tokens=1000,
    )

    content = response.choices[0].message.content
    queries = content.strip().split("\n") if content else []
    queries = [q.strip() for q in queries if q.strip()]
    return queries[:3]


async def score_products(
    products: list[dict],
    recipient: str,
    description: str,
) -> list[dict]:
    print("AI is analyzing gift options based on recipient profile...")

    if len(products) == 0:
        print("No products to score")
        return []

    product_list = "\n".join(
        [
            f"{index + 1}. {product['title']} - {product['price']} - {product['rating']}"
            for index, product in enumerate(products)
        ]
    )

    print(f"Scoring {len(products)} products...")

    response = await asyncio.to_thread(
        openai_client.chat.completions.create,
        model="gpt-4.1",
        messages=[
            {
                "role": "user",
                "content": f"""You are a gift recommendation expert. Score each product based on how well it matches the recipient profile.

RECIPIENT: {recipient}
DESCRIPTION: {description}

PRODUCTS TO SCORE:
{product_list}

For each product, provide a score from 1-10 (10 being perfect match) and a brief reason. Consider:
- How well it matches their interests/hobbies
- Appropriateness for the relationship ({recipient.lower()})
- Value for money
- Uniqueness/thoughtfulness
- Practical usefulness

Return ONLY a valid JSON array (no markdown, no code blocks) with this exact format:
[
  {{
    "productIndex": 1,
    "score": 8,
    "reason": "Perfect for cooking enthusiasts"
  }}
]

IMPORTANT:
- Return raw JSON only, no code blocks
- Include all {len(products)} products
- Keep reasons under 100 characters
- Use productIndex 1-{len(products)}""",
            }
        ],
        max_completion_tokens=1000,
    )

    try:
        response_content = (
            response.choices[0].message.content.strip()
            if response.choices[0].message.content
            else "[]"
        )
        response_content = (
            response_content.replace("```json\n", "")
            .replace("```json", "")
            .replace("```\n", "")
            .replace("```", "")
        )
        scores_data = json.loads(response_content)

        scored_products = []
        for index, product in enumerate(products):
            score_info = next((s for s in scores_data if s.get("productIndex") == index + 1), None)
            product["ai_score"] = score_info.get("score", 0) if score_info else 0
            product["ai_reason"] = (
                score_info.get("reason", "No scoring available")
                if score_info
                else "No scoring available"
            )
            scored_products.append(product)

        scored_products.sort(key=lambda x: x.get("ai_score", 0), reverse=True)
        return scored_products
    except Exception as error:
        print(f"Error parsing AI scores: {error}")
        for product in products:
            product["ai_score"] = 5
            product["ai_reason"] = "Scoring failed - using neutral score"
        return products


async def main() -> None:
    print("Starting Gift Finder Application...")

    recipient = CONFIG["recipient"]
    description = CONFIG["description"]
    print(f"Searching for gifts for: {recipient}")
    print(f"Profile: {description}\n")

    if len(description.strip()) < 5:
        raise ValueError("Description must be at least 5 characters long.")

    print("\nGenerating intelligent search queries...")
    try:
        search_queries = await generate_search_queries(recipient, description)
        print("\nGenerated Search Queries:")
        for index, query in enumerate(search_queries):
            cleaned_query = query.replace('"', "").replace("'", "")
            print(f"   {index + 1}. {cleaned_query}")
    except Exception as error:
        print(f"Error generating search queries: {error}")
        search_queries = ["gifts", "accessories", "items"]

    print("\nStarting concurrent browser searches...")

    async def run_single_search(query: str, session_index: int) -> dict:
        print(f'Starting search session {session_index + 1} for: "{query}"')

        client = AsyncStagehand()
        session = await client.sessions.create(model_name="openai/gpt-4.1")

        print(f"Session {session_index + 1} started: {session.id}")
        print(f"Session {session_index + 1} Live View: https://www.browserbase.com/sessions/{session.id}")

        try:
            print(f"Session {session_index + 1}: Navigating to Firebox.eu...")
            await session.navigate(url="https://firebox.eu/")

            print(f'Session {session_index + 1}: Searching for "{query}"...')
            await session.act(input=f"Type {query} into the search bar")
            await session.act(input="Click the search button")
            await asyncio.sleep(1)

            print(f"Session {session_index + 1}: Extracting product data...")
            products_data = await session.extract(
                instruction="Extract the first 3 products from the search results",
                schema={
                    "type": "object",
                    "properties": {
                        "products": {
                            "type": "array",
                            "maxItems": 3,
                            "description": "array of the first 3 products from search results",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {
                                        "type": "string",
                                        "description": "the title/name of the product",
                                    },
                                    "url": {
                                        "type": "string",
                                        "description": "the full URL link to the product page",
                                    },
                                    "price": {
                                        "type": "string",
                                        "description": "the price of the product",
                                    },
                                    "rating": {
                                        "type": "string",
                                        "description": "the star rating or number of reviews",
                                    },
                                },
                                "required": ["title", "url", "price"],
                            },
                        }
                    },
                    "required": ["products"],
                },
            )

            result = products_data.data.result
            products = result.get("products", []) if isinstance(result, dict) else []
            print(f'Session {session_index + 1}: Found {len(products)} products for "{query}"')

            return {"query": query, "session_index": session_index + 1, "products": products}

        finally:
            await session.end()

    search_promises = [run_single_search(query, index) for index, query in enumerate(search_queries)]

    print("\nBrowser Sessions Starting...")
    all_results = await asyncio.gather(*search_promises)

    total_products = sum(len(result["products"]) for result in all_results)
    print(f"\nTotal products found: {total_products} across {len(search_queries)} searches")

    all_products_flat = []
    for result in all_results:
        all_products_flat.extend(result["products"])

    if len(all_products_flat) > 0:
        try:
            scored_products = await score_products(all_products_flat, recipient, description)
            top3_products = scored_products[:3]

            print("\nTOP 3 RECOMMENDED GIFTS:")
            print("=" * 50)

            for index, product in enumerate(top3_products):
                rank = f"#{index + 1}"
                print(f"\n{rank} - {product.get('title')}")
                print(f"Price: {product.get('price')}")
                print(f"Rating: {product.get('rating', 'N/A')}")
                print(f"AI Score: {product.get('ai_score')}/10")
                print(f"Why: {product.get('ai_reason')}")
                print(f"Link: {product.get('url')}")
                print("-" * 30)

            print(f"\nGift finding complete! Found {total_products} products, analyzed {len(scored_products)} with AI.")
        except Exception as error:
            print(f"Error scoring products: {error}")
    else:
        print("No products found to score")

    print("\nThank you for using Gift Finder!")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as err:
        print(f"Application error: {err}")
        exit(1)
