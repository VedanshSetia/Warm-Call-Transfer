# --- Imports and App Initialization ---
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import os
from dotenv import load_dotenv
import jwt
import time
import requests

load_dotenv()

LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_HOST = os.getenv("LIVEKIT_HOST")


# In-memory summary store: {room: summary}
summary_store = {}

app = FastAPI()

# Allow all origins for development (change to specific origins for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TokenRequest(BaseModel):
    room: str
    identity: str
    name: str = None
    metadata: str = None

class TransferRequest(BaseModel):
    room: str
    from_identity: str
    to_identity: str
    to_name: str = None
    to_metadata: str = None
    summary: str = ""

# --- Endpoints ---
@app.get("/")
def root():
    return {"message": "Backend is running. LiveKit REST API ready."}

@app.post("/get_token")
def get_token(req: TokenRequest):
    now = int(time.time())
    payload = {
        "iss": LIVEKIT_API_KEY,
        "sub": req.identity,
        "nbf": now,
        "exp": now + 3600,
        "video": {
            "room": req.room,
            "roomJoin": True,
        },
    }
    token = jwt.encode(payload, LIVEKIT_API_SECRET, algorithm="HS256")
    return {"token": token}

from fastapi import Request

@app.post("/transfer")
async def transfer(req: TransferRequest, request: Request):
    now = int(time.time())
    payload = {
        "iss": LIVEKIT_API_KEY,
        "sub": req.to_identity,
        "nbf": now,
        "exp": now + 3600,
        "video": {
            "room": req.room,
            "roomJoin": True,
        },
    }
    if req.to_name:
        payload["name"] = req.to_name
    if req.to_metadata:
        payload["metadata"] = req.to_metadata
    token = jwt.encode(payload, LIVEKIT_API_SECRET, algorithm="HS256")

    # --- Gemini LLM summary generation ---
    summary = req.summary
    if not summary or summary.strip().lower() == "auto":
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if gemini_api_key:
            try:
                gemini_url = f"https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key={gemini_api_key}"
                # Try to get transcript from request body if not in req
                transcript = getattr(req, 'transcript', None)
                if not transcript and request is not None:
                    try:
                        body = await request.json()
                        if body and 'transcript' in body:
                            transcript = body['transcript']
                    except Exception:
                        pass
                prompt = f"You are a helpful call center agent. Summarize the following call context for the next agent. Call context for transfer from {req.from_identity} to {req.to_identity}."
                if transcript:
                    print("[Gemini] Using transcript for summary:", transcript)
                    prompt += f"\nTranscript:\n{transcript}"
                else:
                    print("[Gemini] No transcript provided, using default context.")
                print("[Gemini] Prompt:", prompt)
                resp = requests.post(
                    gemini_url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [
                            {"parts": [{"text": prompt}]}
                        ]
                    },
                    timeout=30
                )
                print("[Gemini] Response status:", resp.status_code)
                print("[Gemini] Response text:", resp.text)
                if resp.ok:
                    gemini_data = resp.json()
                    summary = gemini_data["candidates"][0]["content"]["parts"][0]["text"]
                else:
                    summary = "[Gemini summary unavailable]"
            except Exception as e:
                print("[Gemini] Exception:", e)
                summary = f"[Gemini LLM error: {e}]"
        else:
            print("[Gemini] GEMINI_API_KEY not set!")
            summary = "[No summary provided]"

    # --- TTS synthesis (placeholder) ---
    # Example: Use a TTS API to synthesize the summary to audio and return a URL
    # For demo, just return a fake URL
    audio_url = f"https://example.com/tts/{req.room}_{req.to_identity}.mp3"


    # Store summary for this room
    if req.room:
        summary_store[req.room] = summary

    return {
        "token": token,
        "room": req.room,
        "to_identity": req.to_identity,
        "summary": summary,
        "audio_url": audio_url,
    }

# Endpoint to get the latest summary for a room
from fastapi.responses import JSONResponse
@app.get("/get_summary/{room}")
def get_summary(room: str):
    summary = summary_store.get(room)
    if summary:
        return {"room": room, "summary": summary}
    else:
        return JSONResponse(status_code=404, content={"detail": "No summary found for this room."})

