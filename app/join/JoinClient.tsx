"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinClient() {
  const router = useRouter();

  const [room, setRoom] = useState("DUMMY1");
  const [coach, setCoach] = useState("1");

  const go = (path: string) => {
    router.push(`${path}?room=${room}&coach=${coach}`);
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
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ddd",
              fontSize: 14,
            }}
          />
        </div>

        <button
          onClick={() => go("/draft")}
          style={{
            marginTop: 10,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Go to Draft Screen
        </button>

        <button
          onClick={() => go("/board")}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "white",
            color: "#111",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Open Draft Board
        </button>

        <button
          onClick={() => go("/admin")}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "white",
            color: "#111",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Open Admin Panel
        </button>
      </div>
    </div>
  );
}
