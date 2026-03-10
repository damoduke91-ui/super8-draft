"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinClient() {
  const router = useRouter();

  const [room, setRoom] = useState("DUMMY1");
  const [coach, setCoach] = useState("");

  const canGo = room.trim() !== "" && coach.trim() !== "";

  const go = (path: string) => {
    if (!canGo) return;

    router.push(
      `${path}?room=${encodeURIComponent(room.trim())}&coach=${encodeURIComponent(coach.trim())}`
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f3f4f6",
        padding: 20,
      }}
    >
      <div
        style={{
          width: 420,
          background: "white",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <h1 style={{ margin: 0 }}>Join Draft Room</h1>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label>Room ID</label>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label>Coach ID</label>
          <input
            value={coach}
            onChange={(e) => setCoach(e.target.value)}
            placeholder="Enter coach id"
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>

        {!canGo ? (
          <div style={{ fontSize: 12, color: "#666" }}>
            Enter both Room ID and Coach ID before continuing.
          </div>
        ) : null}

        <button
          onClick={() => go("/draft")}
          disabled={!canGo}
          style={{
            marginTop: 10,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: canGo ? "#111" : "#999",
            color: "white",
            fontWeight: 700,
            cursor: canGo ? "pointer" : "not-allowed",
          }}
        >
          Go to Draft Screen
        </button>

        <button
          onClick={() => go("/board")}
          disabled={!canGo}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "white",
            color: canGo ? "#111" : "#999",
            fontWeight: 700,
            cursor: canGo ? "pointer" : "not-allowed",
            opacity: canGo ? 1 : 0.6,
          }}
        >
          Open Draft Board
        </button>

        <button
          onClick={() => go("/admin")}
          disabled={!canGo}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "white",
            color: canGo ? "#111" : "#999",
            fontWeight: 700,
            cursor: canGo ? "pointer" : "not-allowed",
            opacity: canGo ? 1 : 0.6,
          }}
        >
          Open Admin Panel
        </button>
      </div>
    </div>
  );
}