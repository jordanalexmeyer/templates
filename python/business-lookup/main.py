"""Look up an official business record with the Browserbase Fetch API."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any
from urllib.parse import urlencode

from browserbase import AsyncBrowserbase
from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field

load_dotenv()

BUSINESS_NAME = os.environ.get("BUSINESS_NAME", "Jalebi Street")
DATASET_URL = "https://data.sfgov.org/resource/g8m3-pdis.json"


class BusinessInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dba_name: str = Field(description="DBA name")
    ownership_name: str | None
    business_account_number: str = Field(description="Business account number (ttxid)")
    location_id: str | None = Field(description="Location ID (uniqueid)")
    street_address: str | None
    business_start_date: str | None
    business_end_date: str | None
    neighborhood: str | None
    naics_code: str | None
    naics_code_description: str | None
    source_url: str


def string_field(record: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


async def main() -> None:
    api_key = os.environ.get("BROWSERBASE_API_KEY")
    if not api_key:
        raise RuntimeError("BROWSERBASE_API_KEY is required")

    source_url = f"{DATASET_URL}?{urlencode({'$q': BUSINESS_NAME, '$limit': 5})}"
    print(f"Fetching official SF Open Data records for {BUSINESS_NAME!r}...")
    async with AsyncBrowserbase(api_key=api_key) as api:
        response = await api.fetch_api.create(
            url=source_url,
            format="raw",
            allow_redirects=True,
        )
    if not 200 <= response.status_code < 300:
        raise RuntimeError(f"SF Open Data returned HTTP {response.status_code}")
    if not isinstance(response.content, str):
        raise RuntimeError("Expected a raw JSON response from SF Open Data")

    records = json.loads(response.content)
    if not isinstance(records, list):
        raise RuntimeError("Expected SF Open Data to return a JSON array")
    record = next(
        (
            candidate
            for candidate in records
            if isinstance(candidate, dict)
            and (string_field(candidate, "dba_name") or "").casefold() == BUSINESS_NAME.casefold()
        ),
        None,
    )
    if record is None:
        raise RuntimeError(f"No exact DBA record found in {len(records)} returned records")

    business = BusinessInfo(
        dba_name=string_field(record, "dba_name") or BUSINESS_NAME,
        ownership_name=string_field(record, "ownership_name"),
        business_account_number=string_field(record, "ttxid") or "",
        location_id=string_field(record, "uniqueid"),
        street_address=string_field(record, "full_business_address", "street_address"),
        business_start_date=string_field(record, "dba_start_date", "business_start_date"),
        business_end_date=string_field(record, "dba_end_date", "business_end_date"),
        neighborhood=string_field(record, "neighborhoods_analysis_boundaries", "neighborhood"),
        naics_code=string_field(record, "naics_code", "naic_code"),
        naics_code_description=string_field(
            record, "naics_code_description", "naic_code_description"
        ),
        source_url=source_url,
    )
    if not business.business_account_number:
        raise RuntimeError("The exact record did not include its ttxid")

    print(business.model_dump_json(indent=2))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"Business lookup failed: {error}")
        raise SystemExit(1) from error
