import io
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from pypdf import PdfReader

# Load environment variables from script directory and current working directory
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("omniform-ai.backend")

# Nebius API constants
NEBIUS_BASE_URL = "https://api.studio.nebius.ai/v1/"
NEBIUS_API_KEY = os.getenv("NEBIUS_API_KEY", "")

# Verified Model IDs active on Nebius Token Factory
# Ingest: deepseek-ai/DeepSeek-V4.1-Flash (deep document/CV parsing)
# Mapping: zai-org/GLM-5.3-Flash (ultra-low latency, strict JSON DOM matching)
INGEST_MODEL = os.getenv("INGEST_MODEL", "deepseek-ai/DeepSeek-V4.1-Flash")
MAPPING_MODEL = os.getenv("MAPPING_MODEL", "zai-org/GLM-5.3-Flash")

# Helper to get or create client safely across event loops
def get_nebius_client() -> AsyncOpenAI:
    current_key = os.getenv("NEBIUS_API_KEY", "")
    return AsyncOpenAI(
        base_url=NEBIUS_BASE_URL,
        api_key=current_key if current_key else "dummy-key-for-init",
    )

nebius_client = get_nebius_client()

app = FastAPI(
    title="OmniForm AI Backend",
    description="Document parsing and DOM field mapping API powered by Nebius Token Factory",
    version="1.0.0",
)

# Enable CORS for Chrome Extension requests and local frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FormField(BaseModel):
    id: str = Field(..., description="Unique field identifier or name")
    name: Optional[str] = Field(None, description="DOM element name attribute")
    type: Optional[str] = Field("text", description="Input type (text, email, select, etc.)")
    label: Optional[str] = Field(None, description="Associated label text or placeholder")
    placeholder: Optional[str] = Field(None, description="Placeholder text if present")
    tagName: Optional[str] = Field(None, description="HTML Tag name (input, select, textarea)")
    options: Optional[List[Dict[str, Any]]] = Field(None, description="Options for select inputs")


class MapFieldsRequest(BaseModel):
    form_fields: List[FormField] = Field(..., description="List of sanitized DOM inputs")
    user_profile: Dict[str, Any] = Field(..., description="User profile structured data")


def clean_json_response(raw_text: str) -> Dict[str, Any]:
    """
    Cleans and extracts JSON content from model responses, handling
    potential markdown code fences or conversational preambles.
    """
    text = raw_text.strip()
    
    # Strip markdown code blocks like ```json ... ``` or ``` ... ```
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()

    # If there is conversational text before or after the JSON block, locate braces
    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
    if match:
        candidate = match.group(0)
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    return json.loads(text)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extracts raw text content across all pages from PDF bytes."""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages_text = []
        for index, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                pages_text.append(text.strip())
        return "\n\n".join(pages_text)
    except Exception as e:
        logger.error(f"Failed to parse PDF document: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read PDF file: {str(e)}",
        )


@app.get("/api/health")
async def health_check():
    """Health check endpoint to verify backend status and Nebius configuration."""
    current_key = os.getenv("NEBIUS_API_KEY", "")
    api_key_set = bool(current_key and current_key != "your_nebius_api_key_here")
    return {
        "status": "healthy",
        "service": "omniform-ai-backend",
        "nebius_base_url": NEBIUS_BASE_URL,
        "nebius_api_key_configured": api_key_set,
        "models": {
            "ingest": os.getenv("INGEST_MODEL", INGEST_MODEL),
            "mapping": os.getenv("MAPPING_MODEL", MAPPING_MODEL),
        },
    }


@app.post("/api/ingest-document")
async def ingest_document(file: UploadFile = File(...)):
    """
    Accepts a file upload (PDF/CV).
    Extracts text and prompts Nebius deepseek-ai/DeepSeek-V4.1-Flash to extract a structured JSON profile.
    """
    current_key = os.getenv("NEBIUS_API_KEY", "")
    if not current_key or current_key == "your_nebius_api_key_here":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="NEBIUS_API_KEY is not configured in backend/.env. Please configure your key from https://studio.nebius.ai/.",
        )

    # Validate file extension
    filename = file.filename or ""
    if not filename.lower().endswith((".pdf", ".txt")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supported formats: PDF (.pdf) or text (.txt)",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # Extract text from PDF or decode plain text
    if filename.lower().endswith(".pdf"):
        extracted_text = extract_text_from_pdf(content)
    else:
        try:
            extracted_text = content.decode("utf-8")
        except UnicodeDecodeError:
            extracted_text = content.decode("latin-1", errors="replace")

    if not extracted_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No readable text could be extracted from the uploaded document.",
        )

    logger.info(f"Ingesting document '{filename}', extracted {len(extracted_text)} characters.")

    prompt = (
        "Extract the following resume into a comprehensive JSON object containing name, contact info, "
        "work history, skills, and education.\n\n"
        "Input document:\n"
        f"\"\"\"\n{extracted_text}\n\"\"\"\n\n"
        "Return strictly valid JSON without any markdown formatting or commentary."
    )

    try:
        active_model = os.getenv("INGEST_MODEL", INGEST_MODEL)
        client = nebius_client if hasattr(nebius_client.chat.completions.create, "mock") else get_nebius_client()
        response = await client.chat.completions.create(
            model=active_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert resume parsing agent. Extract the resume into a clean, "
                        "comprehensive JSON object. Output strictly valid JSON."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=4096,
        )

        raw_output = response.choices[0].message.content or ""
        parsed_profile = clean_json_response(raw_output)
        return parsed_profile

    except json.JSONDecodeError as err:
        logger.error(f"JSON decoding error from Nebius response: {err}\nRaw output: {raw_output}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The model response was not valid JSON.",
        )
    except Exception as e:
        logger.error(f"Error querying Nebius API: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Nebius API error: {str(e)}",
        )


@app.post("/api/map-fields")
async def map_fields(payload: MapFieldsRequest):
    """
    Accepts form_fields (sanitized DOM inputs) and user_profile (saved JSON).
    Sends both to Nebius zai-org/GLM-5.3-Flash to match user data to DOM inputs.
    """
    current_key = os.getenv("NEBIUS_API_KEY", "")
    if not current_key or current_key == "your_nebius_api_key_here":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="NEBIUS_API_KEY is not configured in backend/.env. Please configure your key from https://studio.nebius.ai/.",
        )

    form_fields_json = json.dumps([field.model_dump() for field in payload.form_fields], indent=2)
    user_profile_json = json.dumps(payload.user_profile, indent=2)

    prompt = (
        "You are a DOM mapping agent. Match the user profile data to the provided form fields. "
        "Output strictly a JSON dictionary where keys are the field IDs and values are the appropriate answers. "
        "If the profile lacks the data for a field, set the value to null.\n\n"
        f"User Profile:\n{user_profile_json}\n\n"
        f"Form Fields:\n{form_fields_json}\n\n"
        "Output strictly the JSON dictionary mapping field IDs to their corresponding values."
    )

    try:
        active_model = os.getenv("MAPPING_MODEL", MAPPING_MODEL)
        client = nebius_client if hasattr(nebius_client.chat.completions.create, "mock") else get_nebius_client()
        response = await client.chat.completions.create(
            model=active_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a DOM mapping agent. Output strictly a JSON dictionary mapping "
                        "field IDs to values, with null for missing values. No prose, no markdown explanation."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
            max_tokens=2048,
        )

        raw_output = response.choices[0].message.content or ""
        mapping_dict = clean_json_response(raw_output)

        if not isinstance(mapping_dict, dict):
            raise ValueError("Expected mapping output to be a dictionary")

        return mapping_dict

    except json.JSONDecodeError as err:
        logger.error(f"JSON decoding error in map-fields: {err}\nRaw output: {raw_output}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The model response was not a valid JSON dictionary.",
        )
    except Exception as e:
        logger.error(f"Error querying Nebius API: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Nebius API error: {str(e)}",
        )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port, reload=True)
