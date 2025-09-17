

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

# @app.get("/get_token_test")
# def get_token_test():
#     from livekit.api import AccessToken, VideoGrants

#     at = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
#     grant = VideoGrants(room="testroom")
#     token = at.to_jwt(identity="user1", grants=[grant])


#     token = at.to_jwt(identity="user1", name="user1")
#     return {"token": token, "message": "This is a test token"}
