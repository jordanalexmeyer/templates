# Stagehand + Browserbase: Restaurant Menu Extractor - Configuration
# See README.md for full documentation

"""Configuration and environment variables for the restaurant scraper."""

import os
import logging
from dotenv import load_dotenv
from browserbase import Browserbase

# Load environment variables from .env file
load_dotenv()

# API Keys
MODEL_API_KEY = os.getenv("GOOGLE_API_KEY")  # Google API key for Gemini models
BROWSERBASE_API_KEY = os.getenv("BROWSERBASE_API_KEY")
BROWSERBASE_PROJECT_ID = os.getenv("BROWSERBASE_PROJECT_ID")

# File paths
WEBSITES_FILE = os.getenv("WEBSITES_FILE", "websites.txt")
OUTPUT_DIR = "results"

# Scraper settings
NO_MENU_LINK_FOUND = "NO_MENU_LINK_FOUND"
MAX_RETRIES = 3

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize Browserbase client
bb = Browserbase(api_key=BROWSERBASE_API_KEY)
