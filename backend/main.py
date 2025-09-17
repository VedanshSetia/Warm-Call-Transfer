# --- Imports and App Initialization ---
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv
import jwt
import time

load_dotenv()

LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_HOST = os.getenv("LIVEKIT_HOST")

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

@app.post("/transfer")
def transfer(req: TransferRequest):
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
    return {"token": token, "room": req.room, "to_identity": req.to_identity}

