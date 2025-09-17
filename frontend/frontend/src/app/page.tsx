// "use client";

// import { useEffect, useState } from "react";

// export default function Home() {
//   const [status, setStatus] = useState("Loading...");

//   useEffect(() => {
//     fetch("http://localhost:8000/")
//       .then((res) => res.json())
//       .then((data) => setStatus(data.message))
//       .catch(() => setStatus("Could not connect to backend"));
//   }, []);

//   return (
//     <main className="flex min-h-screen flex-col items-center justify-center p-24">
//       <h1 className="text-4xl font-bold mb-4">Warm Transfer Demo</h1>
//       <p className="text-lg">Backend status: <span className="font-mono">{status}</span></p>
//     </main>
//   );
// }

"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  Room,
  RoomEvent,
  TrackPublication,
  RemoteParticipant,
} from "livekit-client";

export default function Home() {
  const [roomName, setRoomName] = useState("");
  const [identity, setIdentity] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  // Warm transfer state
  const [transferTarget, setTransferTarget] = useState("");
  const [transferSummary, setTransferSummary] = useState("");
  const [transferResult, setTransferResult] = useState<string | null>(null);
  const [transferSummaryResult, setTransferSummaryResult] = useState<string | null>(null);
  const [transferAudioUrl, setTransferAudioUrl] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ sender: string; text: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  // Send chat message to all participants (using LiveKit data messages)
  async function sendMessage() {
    if (!room || !chatInput.trim()) return;
    try {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ sender: identity, text: chatInput })),
        { reliable: true }
      );
      setMessages((prev) => [...prev, { sender: identity, text: chatInput }]);
      setChatInput("");
    } catch (err) {
      alert("Failed to send message");
    }
  }

  // Listen for incoming chat messages
  useEffect(() => {
    if (!room) return;
    function handleData({ payload, participant }: any) {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        setMessages((prev) => [...prev, { sender: msg.sender || participant.identity, text: msg.text }]);
      } catch {}
    }
    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Adjust if your LiveKit server runs elsewhere
  const wsUrl = "wss://warmtransfer-nqjg9g4r.livekit.cloud";

  useEffect(() => {
    return () => {
      if (room) {
        room.disconnect();
      }
    };
  }, [room]);

  async function joinRoom() {
    if (!roomName || !identity) {
      alert("Please enter room name and identity.");
      return;
    }

    try {
      const resp = await fetch("http://localhost:8000/get_token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName, identity }),
      });
      const data = await resp.json();

      if (!data.token) {
        throw new Error("No token returned from backend");
      }

      const newRoom = new Room();
      await newRoom.connect(wsUrl, data.token);
      setRoom(newRoom);
      setStatus("Connected");

      // Add yourself
      setParticipants([newRoom.localParticipant.identity]);

      // Add existing remote participants
      newRoom.remoteParticipants.forEach((p: RemoteParticipant) => {
        setParticipants((prev) => [...prev, p.identity]);
      });

      // Listen for new participants
      newRoom.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        setParticipants((prev) => [...prev, participant.identity]);
      });

      // Listen for participants leaving
      newRoom.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        setParticipants((prev) => prev.filter((id) => id !== participant.identity));
      });

      // Optional: log track publications
      newRoom.on(
        RoomEvent.TrackPublished,
        (pub: TrackPublication, participant: RemoteParticipant) => {
          console.log(
            `Track published by ${participant.identity}: ${pub.trackName || pub.kind}`
          );
        }
      );
    } catch (err: any) {
      console.error(err);
      setStatus("Error: " + err.message);
    }
  }

  async function handleTransfer() {
    setTransferResult(null);
    setTransferSummaryResult(null);
    setTransferAudioUrl(null);
    setTransferError(null);
    if (!roomName || !identity || !transferTarget) {
      setTransferError("Missing room, your identity, or target identity.");
      return;
    }
    try {
      const resp = await fetch("http://localhost:8000/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: roomName,
          from_identity: identity,
          to_identity: transferTarget,
          summary: transferSummary,
          transcript: messages.map((m) => `${m.sender}: ${m.text}`).join("\n"),
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.token) {
        throw new Error(data.detail || "No token returned from backend");
      }
      setTransferResult(data.token);
      setTransferSummaryResult(data.summary || null);
      setTransferAudioUrl(data.audio_url || null);

      // Send the summary as a chat message from the previous agent
      if (room && data.summary) {
        const summaryMsg = {
          sender: identity,
          text: `[Call Summary for next agent]: ${data.summary}`,
        };
        await room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify(summaryMsg)),
          { reliable: true }
        );
        setMessages((prev) => [...prev, { sender: identity, text: `[Call Summary for next agent]: ${data.summary}` }]);
      }
    } catch (err: any) {
      setTransferError(err.message || "Transfer failed");
    }
  }

  function leaveRoom() {
    if (room) {
      room.disconnect();
      setRoom(null);
      setParticipants([]);
      setStatus("Left the room");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12">
      <h1 className="text-3xl font-bold mb-4">Warm Transfer Demo</h1>
      <div className="mb-6">
        <input
          placeholder="Room name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          className="p-2 border rounded mr-2"
          disabled={!!room}
        />
        <input
          placeholder="Identity"
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
          className="p-2 border rounded mr-2"
          disabled={!!room}
        />
        {!room ? (
          <button
            onClick={joinRoom}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Join
          </button>
        ) : (
          <button
            onClick={leaveRoom}
            className="bg-red-600 text-white px-4 py-2 rounded"
          >
            Leave
          </button>
        )}
      </div>
      <p>Status: {status}</p>

      {/* Transfer UI: Only show when connected */}
      {room && (
        <div className="mb-6 w-full max-w-md">
          <h2 className="text-xl font-semibold mb-2">Warm Transfer</h2>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Target agent/bot identity"
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              className="p-2 border rounded"
            />
            <textarea
              placeholder="Call summary/context to send to Agent B (leave blank or type 'auto' for LLM)"
              value={transferSummary}
              onChange={(e) => setTransferSummary(e.target.value)}
              className="p-2 border rounded"
              rows={3}
            />
            <button
              onClick={handleTransfer}
              className="bg-green-600 text-white px-4 py-2 rounded"
              disabled={!transferTarget}
            >
              Transfer
            </button>
          </div>
          {transferResult && (
            <div className="text-xs text-gray-700 break-all mt-2">
              <strong>Transfer Token:</strong> {transferResult}
            </div>
          )}
          {transferSummaryResult && (
            <div className="text-xs text-blue-700 mt-2">
              <strong>Summary sent to Agent B:</strong> {transferSummaryResult}
            </div>
          )}
          {transferAudioUrl && (
            <div className="text-xs text-green-700 mt-2">
              <strong>Audio (TTS):</strong> <a href={transferAudioUrl} target="_blank" rel="noopener noreferrer">Play Audio</a>
            </div>
          )}
          {transferError && (
            <div className="text-xs text-red-600 mt-2">{transferError}</div>
          )}
        </div>
      )}

      {/* Chat UI: Only show when connected */}
      {room && (
        <div className="mb-6 w-full max-w-md bg-white rounded-lg shadow p-4 border border-gray-200">
          <h2 className="text-xl font-semibold mb-3 text-blue-700">Chat</h2>
          <div className="h-40 overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3" style={{ minHeight: 120 }}>
            {messages.length === 0 && <div className="text-gray-400">No messages yet</div>}
            {messages.map((m, i) => (
              <div key={i} className="mb-1"><span className="font-semibold text-blue-800">{m.sender}:</span> <span className="text-gray-800">{m.text}</span></div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="p-2 border border-gray-300 rounded-lg flex-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
            />
            <button
              onClick={sendMessage}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold shadow"
              disabled={!chatInput.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 w-full max-w-md">
        <h2 className="text-xl font-semibold">Participants</h2>
        <ul className="mt-2 list-disc list-inside">
          {participants.length === 0 && <li>No participants yet</li>}
          {participants.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
