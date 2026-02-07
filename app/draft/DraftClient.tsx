"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";

type DraftState = {
  room_id: string;
  is_paused: boolean;
  pause_reason: string | null;
  rounds_total: number;
  current_round: number;
  current_pick_in_round: number;
  current_coach_id: number;
};

type Player = {
  player_no: number;
  pos: string;
  club: string;
  player_name: string;
  average: number;
  drafted_by_coach_id: number | null;
  drafted_round: number | null;
  drafted_pick: number | null;
};

const POS_MAP: Record<string, string> = {
  ALL: "All",
  DEF: "DEF",
  KD: "KD",
  MID: "MID",
  RUC: "RUC",
  FWD: "FWD",
  KF: "KF",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Accepts "#rrggbb" and returns {r,g,b}
function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return { r: 255, g: 255, b: 255 };
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

// Relative luminance (0..1)
function luminanceFromHex(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  // sRGB -> linear
  const srgb = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

// Auto pick black/white text for any background
function bestTextColor(bgHex: string) {
  const L = luminanceFromHex(bgHex);
  return L > 0.5 ? "#111" : "#fff";
}

function pauseReasonLabel(pause_reason: string | null) {
  if (!pause_reason) return null;
  if (pause_reason.startsWith("WAIT_BLOCK_")) {
    const block = pause_reason.replace("WAIT_BLOCK_", "");
    return `Waiting for Admin to set draft order for rounds ${block}…`;
  }
  return "Paused";
}

// --- Position helpers ---
// supports "MID/FWD", "DEF", "KD", etc.
function splitPos(posRaw: string): string[] {
  return (posRaw || "")
    .split("/")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

// The rules you asked for:
// - DEF tab shows DEF players BUT not KD players
// - FWD tab shows FWD players BUT not KF players
// - KD tab only KD
// - KF tab only KF
// - MID tab includes MID (even if MID/FWD etc.)
// - RUC tab includes RUC
function matchesTab(player: Player, tab: string): boolean {
  const tags = splitPos(player.pos);
  if (tab === "ALL") return true;

  if (tab === "DEF") return tags.includes("DEF") && !tags.includes("KD");
  if (tab === "FWD") return tags.includes("FWD") && !tags.includes("KF");

  if (tab === "KD") return tags.includes("KD");
  if (tab === "KF") return tags.includes("KF");

  // default: strict include (handles dual positions)
  return tags.includes(tab);
}

export default function DraftClient() {
  const sp = useSearchParams();
  const room = sp.get("room") || "DUMMY1";
  const coachId = Number(sp.get("coach") || "1");

  const [state, setState] = useState<DraftState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);

  // UI controls
  const [posTab, setPosTab] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<"player_no" | "player_name" | "club" | "average">(
    "player_no"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const loadState = async () => {
    const { data, error } = await supabase
      .from("draft_state")
      .select(
        "room_id,is_paused,pause_reason,rounds_total,current_round,current_pick_in_round,current_coach_id"
      )
      .eq("room_id", room)
      .single();

    if (error) {
      console.error("draft loadState error:", error);
      setState(null);
    } else {
      setState(data as DraftState);
    }
  };

  const loadPlayers = async () => {
    const { data, error } = await supabase
      .from("players")
      .select("player_no,pos,club,player_name,average,drafted_by_coach_id,drafted_round,drafted_pick")
      .eq("room_id", room);

    if (error) {
      console.error("draft loadPlayers error:", error);
      setPlayers([]);
    } else {
      setPlayers((data as Player[]) || []);
    }
  };

  useEffect(() => {
    loadState();
    loadPlayers();

    const s1 = supabase
      .channel(`draft_state_${room}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_state", filter: `room_id=eq.${room}` },
        () => loadState()
      )
      .subscribe();

    const s2 = supabase
      .channel(`draft_players_${room}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room}` },
        () => loadPlayers()
      )
      .subscribe();

    // Poll fallback
    const poll = setInterval(() => {
      loadState();
      loadPlayers();
    }, 1000);

    return () => {
      supabase.removeChannel(s1);
      supabase.removeChannel(s2);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const isMyTurn = !!state && !state.is_paused && state.current_coach_id === coachId;

  const topBar = useMemo(() => {
    if (!state) return `Room ${room} • Loading…`;
    const live = state.is_paused ? "PAUSED" : "LIVE";
    return `Room ${room} • Round ${state.current_round}/${state.rounds_total} • Pick ${state.current_pick_in_round} • ${live}`;
  }, [state, room]);

  const available = useMemo(() => players.filter((p) => p.drafted_by_coach_id == null), [players]);

  const filtered = useMemo(() => {
    let list = available;

    // ✅ new smarter filter (supports dual pos + your KD/KF rules)
    list = list.filter((p) => matchesTab(p, posTab));

    list = list.slice().sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "player_no") return (a.player_no - b.player_no) * dir;
      if (sortKey === "average") return (a.average - b.average) * dir;
      if (sortKey === "club") return a.club.localeCompare(b.club) * dir;
      return a.player_name.localeCompare(b.player_name) * dir;
    });

    return list;
  }, [available, posTab, sortKey, sortDir]);

  const myPicks = useMemo(() => {
    return players
      .filter((p) => p.drafted_by_coach_id === coachId && p.drafted_round && p.drafted_pick)
      .slice()
      .sort((a, b) => (a.drafted_round! - b.drafted_round!) || (a.drafted_pick! - b.drafted_pick!));
  }, [players, coachId]);

  // Simple “My Draft Sheet” slots (46) – shows what you’ve picked so far
  const myDraftSheet = useMemo(() => {
    const roundsTotal = state?.rounds_total ?? 46;
    const slots = Array.from({ length: roundsTotal }, (_, i) => i + 1);
    return slots.map((slotNo) => {
      const assigned = myPicks[slotNo - 1] || null;
      return {
        slotNo,
        displayPosition: assigned ? assigned.pos : "",
        assigned,
      };
    });
  }, [myPicks, state]);

  const toggleSort = (key: typeof sortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const draftPlayer = async (p: Player) => {
    if (!state) return;
    if (state.is_paused) {
      alert(pauseReasonLabel(state.pause_reason) ?? "Draft is paused.");
      return;
    }
    if (!isMyTurn) {
      alert("Not your turn.");
      return;
    }
    if (busy) return;

    setBusy(true);

    const { data, error } = await supabase.rpc("draft_pick", {
      p_room_id: room,
      p_player_no: p.player_no,
      p_coach_id: coachId,
      p_override_turn: false,
    });

    if (error) {
      console.error("draft draft_pick RPC error:", error);
      alert("Draft failed: " + error.message);
      setBusy(false);
      return;
    }

    const res = Array.isArray(data) ? data[0] : data;
    if (!res?.ok) {
      alert("Draft failed: " + (res?.message ?? "Unknown error"));
      setBusy(false);
      return;
    }

    setBusy(false);
    // state + players will refresh via realtime/poll
  };

  // --- Styling: smart text colour for the Available panel ---
  // You can tweak this base background as you like:
  const availablePanelBg = "#2f2f2f"; // dark panel
  const availableText = bestTextColor(availablePanelBg);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ padding: 12, border: "1px solid #ddd", marginBottom: 12 }}>
        <strong>{topBar}</strong>
        <div style={{ marginTop: 6, color: isMyTurn ? "green" : "#555" }}>
          {state?.is_paused
            ? pauseReasonLabel(state.pause_reason) ?? "Waiting (Admin hasn’t started the draft yet)…"
            : isMyTurn
            ? "You are ON THE CLOCK"
            : "Waiting for your turn…"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* LEFT: Available Players */}
        <div
          style={{
            border: "1px solid #ddd",
            padding: 12,
            background: availablePanelBg,
            color: availableText,
            borderRadius: 10,
          }}
        >
          <h2 style={{ marginTop: 0, color: availableText }}>Available Players</h2>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {Object.keys(POS_MAP).map((k) => {
              const active = posTab === k;
              const bg = active ? "#555" : "#1f1f1f";
              const fg = bestTextColor(bg);

              return (
                <button
                  key={k}
                  style={{
                    padding: "8px 14px",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 700,
                    background: bg,
                    color: fg,
                    boxShadow: active ? "inset 0 0 0 2px #aaa" : "inset 0 0 0 1px #444",
                  }}
                  onClick={() => setPosTab(k)}
                >
                  {POS_MAP[k]}
                </button>
              );
            })}
          </div>

          {/* Sort controls */}
          <div style={{ display: "flex", gap: 10, fontSize: 12, marginBottom: 10, color: availableText }}>
            <span>Sort:</span>
            <button onClick={() => toggleSort("player_no")}>ID</button>
            <button onClick={() => toggleSort("player_name")}>Name</button>
            <button onClick={() => toggleSort("club")}>Club</button>
            <button onClick={() => toggleSort("average")}>Average</button>
            <span style={{ opacity: 0.7 }}>
              ({sortKey} {sortDir})
            </span>
          </div>

          {/* Available list */}
          <div
            style={{
              maxHeight: 520,
              overflowY: "auto",
              borderTop: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {filtered.map((p) => (
              <div
                key={p.player_no}
                style={{
                  padding: 10,
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ color: availableText }}>
                  <div>
                    <strong style={{ color: availableText }}>{p.player_no}</strong> — {p.player_name}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {p.club} • {p.pos} • Avg {p.average}
                  </div>
                </div>

                <button
                  disabled={!isMyTurn || busy}
                  onClick={() => draftPlayer(p)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #222",
                    cursor: !isMyTurn || busy ? "not-allowed" : "pointer",
                    background: !isMyTurn || busy ? "#999" : "#fff",
                    color: !isMyTurn || busy ? "#333" : "#000",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  Draft
                </button>
              </div>
            ))}

            {filtered.length === 0 ? (
              <div style={{ padding: 12, opacity: 0.8, color: availableText }}>
                No players found for {POS_MAP[posTab] ?? posTab}.
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT: My Draft Sheet */}
        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10 }}>
          <h2 style={{ marginTop: 0 }}>My Draft Sheet</h2>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Slot #
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Position
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Player #
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Player
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Club
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Pick #
                  </th>
                </tr>
              </thead>

              <tbody>
                {myDraftSheet.map((s) => (
                  <tr key={s.slotNo}>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{s.slotNo}</td>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>{s.displayPosition}</td>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                      {s.assigned ? s.assigned.player_no : ""}
                    </td>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                      {s.assigned ? s.assigned.player_name : ""}
                    </td>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                      {s.assigned ? s.assigned.club : ""}
                    </td>
                    <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                      {s.assigned && s.assigned.drafted_round && s.assigned.drafted_pick
                        ? `${s.assigned.drafted_round}.${s.assigned.drafted_pick}`
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            Slots shown = {state?.rounds_total ?? 46}
          </div>
        </div>
      </div>
    </div>
  );
}
