"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const QUICK_COACHES = [
  { id: 1, name: "Adrian" },
  { id: 2, name: "Chris" },
  { id: 3, name: "Damian" },
  { id: 4, name: "Dane" },
  { id: 5, name: "Josh" },
  { id: 6, name: "Mark" },
  { id: 7, name: "Rick" },
  { id: 8, name: "Troy" },
];

export default function JoinClient() {
  const router = useRouter();

  const [room, setRoom] = useState("DUMMY1");
  const [coach, setCoach] = useState("3");

  const roomClean = useMemo(() => room.trim().toUpperCase(), [room]);
  const coachClean = useMemo(() => coach.trim(), [coach]);

  const go = (path: string) => {
    if (!roomClean) {
      alert("Please enter a Room ID.");
      return;
    }

    if (!coachClean) {
      alert("Please enter a Coach ID.");
      return;
    }

    router.push(`${path}?room=${encodeURIComponent(roomClean)}&coach=${encodeURIComponent(coachClean)}`);
  };

  const pageBg = "#eef2f7";
  const textMain = "#101828";
  const textSoft = "#475467";
  const border = "#d0d5dd";
  const panelBg = "#ffffff";
  const inputBg = "#ffffff";
  const primary = "#111111";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(180deg, ${pageBg} 0%, #e7ecf3 100%)`,
        padding: 20,
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          background: panelBg,
          borderRadius: 20,
          padding: 28,
          boxShadow: "0 18px 50px rgba(16,24,40,0.10)",
          border: `1px solid ${border}`,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div>
          <div
            style={{
              display: "inline-block",
              padding: "6px 10px",
              borderRadius: 999,
              background: "#f2f4f7",
              color: textSoft,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 0.3,
            }}
          >
            SUPER 8 DRAFT
          </div>

          <h1
            style={{
              margin: "12px 0 6px 0",
              fontSize: 32,
              lineHeight: 1.1,
              color: textMain,
            }}
          >
            Join Draft Room
          </h1>

          <div style={{ color: textSoft, fontSize: 15, lineHeight: 1.45 }}>
            Enter the room and coach you want to use, then open the draft screen, board, or admin panel.
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontWeight: 800, color: textMain }}>Room ID</label>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. DUMMY1"
              style={{
                padding: "14px 14px",
                borderRadius: 12,
                border: `1px solid ${border}`,
                fontSize: 16,
                fontWeight: 700,
                color: textMain,
                background: inputBg,
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontWeight: 800, color: textMain }}>Coach ID</label>
            <input
              value={coach}
              onChange={(e) => setCoach(e.target.value)}
              placeholder="e.g. 3"
              style={{
                padding: "14px 14px",
                borderRadius: 12,
                border: `1px solid ${border}`,
                fontSize: 16,
                fontWeight: 700,
                color: textMain,
                background: inputBg,
                outline: "none",
              }}
            />
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: "1px solid #dbe3ef",
              background: "#f8fafc",
            }}
          >
            <div style={{ fontWeight: 900, color: textMain, marginBottom: 10 }}>Quick coach pick</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {QUICK_COACHES.map((c) => {
                const active = coachClean === String(c.id);

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCoach(String(c.id))}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: active ? "1px solid #111" : "1px solid #cbd5e1",
                      background: active ? "#111" : "#fff",
                      color: active ? "#fff" : textMain,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {c.id} {c.name}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 10, fontSize: 13, color: textSoft }}>
              For your manual test, choose <strong>Coach 3</strong>.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}
        >
          <button
            onClick={() => go("/draft")}
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              border: `1px solid ${primary}`,
              background: primary,
              color: "white",
              fontWeight: 900,
              fontSize: 15,
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(17,17,17,0.18)",
            }}
          >
            Open Draft Screen
          </button>

          <button
            onClick={() => go("/board")}
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              border: `1px solid ${border}`,
              background: "#fff",
              color: textMain,
              fontWeight: 900,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Open Draft Board
          </button>

          <button
            onClick={() => go("/admin")}
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              border: `1px solid ${border}`,
              background: "#fff",
              color: textMain,
              fontWeight: 900,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Open Admin Panel
          </button>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 14,
            background: "#f8fafc",
            border: "1px solid #e4e7ec",
            color: textSoft,
            fontSize: 14,
            lineHeight: 1.45,
          }}
        >
          Manual simulation flow: generate the order in Admin, start the draft, then join the draft screen as the
          coach you want to control.
        </div>
      </div>
    </div>
  );
}