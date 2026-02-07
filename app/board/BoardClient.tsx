"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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

type Coach = {
  coach_id: number;
  coach_name: string;
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

type DraftOrderRow = {
  overall_pick: number;
  coach_id: number;
};

function pauseReasonLabel(pause_reason: string | null) {
  if (!pause_reason) return null;
  if (pause_reason.startsWith("WAIT_BLOCK_")) {
    const block = pause_reason.replace("WAIT_BLOCK_", "");
    return `Waiting for Admin to set draft order for rounds ${block}…`;
  }
  return "Paused";
}

export default function BoardClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const room = sp.get("room") || "DUMMY1";

  const [state, setState] = useState<DraftState | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [draftOrder, setDraftOrder] = useState<DraftOrderRow[]>([]);

  const [bigMode, setBigMode] = useState(true);

  const scrollWrapRef = useRef<HTMLDivElement | null>(null);
  const currentRowRef = useRef<HTMLTableRowElement | null>(null);

  const loadState = async () => {
    const { data, error } = await supabase
      .from("draft_state")
      .select(
        "room_id,is_paused,pause_reason,rounds_total,current_round,current_pick_in_round,current_coach_id"
      )
      .eq("room_id", room)
      .single();

    if (error) {
      console.error("board loadState error:", error);
      setState(null);
    } else {
      setState(data as DraftState);
    }
  };

  const loadCoaches = async () => {
    const { data, error } = await supabase
      .from("coaches")
      .select("coach_id,coach_name")
      .eq("room_id", room)
      .order("coach_id");

    if (error) {
      console.error("board loadCoaches error:", error);
      setCoaches([]);
    } else {
      setCoaches((data as Coach[]) || []);
    }
  };

  const loadPlayers = async () => {
    const { data, error } = await supabase
      .from("players")
      .select(
        "player_no,pos,club,player_name,average,drafted_by_coach_id,drafted_round,drafted_pick"
      )
      .eq("room_id", room);

    if (error) {
      console.error("board loadPlayers error:", error);
      setPlayers([]);
    } else {
      setPlayers((data as Player[]) || []);
    }
  };

  const loadDraftOrder = async () => {
    const { data, error } = await supabase
      .from("draft_order")
      .select("overall_pick,coach_id")
      .eq("room_id", room)
      .order("overall_pick");

    if (error) {
      console.error("board loadDraftOrder error:", error);
      setDraftOrder([]);
    } else {
      setDraftOrder((data as DraftOrderRow[]) || []);
    }
  };

  useEffect(() => {
    loadState();
    loadCoaches();
    loadPlayers();
    loadDraftOrder();

    const s1 = supabase
      .channel(`board_state_${room}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_state", filter: `room_id=eq.${room}` },
        () => loadState()
      )
      .subscribe();

    const s2 = supabase
      .channel(`board_players_${room}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room}` },
        () => loadPlayers()
      )
      .subscribe();

    const s3 = supabase
      .channel(`board_order_${room}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_order", filter: `room_id=eq.${room}` },
        () => loadDraftOrder()
      )
      .subscribe();

    const s4 = supabase
      .channel(`board_coaches_${room}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "coaches", filter: `room_id=eq.${room}` },
        () => loadCoaches()
      )
      .subscribe();

    const poll = setInterval(() => {
      loadState();
      loadCoaches();
      loadPlayers();
      loadDraftOrder();
    }, 1500);

    return () => {
      supabase.removeChannel(s1);
      supabase.removeChannel(s2);
      supabase.removeChannel(s3);
      supabase.removeChannel(s4);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const coachCount = useMemo(() => (coaches.length > 0 ? coaches.length : 2), [coaches]);

  const coachNameById = useMemo(() => {
    const m = new Map<number, string>();
    coaches.forEach((c) => m.set(c.coach_id, c.coach_name));
    return m;
  }, [coaches]);

  const draftOrderByOverall = useMemo(() => {
    const m = new Map<number, number>();
    draftOrder.forEach((r) => m.set(r.overall_pick, r.coach_id));
    return m;
  }, [draftOrder]);

  const overallFromRoundPick = (round: number, pickInRound: number) => (round - 1) * coachCount + pickInRound;

  const currentOverall = useMemo(() => {
    if (!state) return null;
    return overallFromRoundPick(state.current_round, state.current_pick_in_round);
  }, [state, coachCount]);

  const draftedByOverall = useMemo(() => {
    const m = new Map<number, Player>();
    for (const p of players) {
      if (p.drafted_round && p.drafted_pick) {
        const ov = overallFromRoundPick(p.drafted_round, p.drafted_pick);
        m.set(ov, p);
      }
    }
    return m;
  }, [players, coachCount]);

  const totalOverall = useMemo(() => {
    const roundsTotal = state?.rounds_total ?? 46;
    return roundsTotal * coachCount;
  }, [state, coachCount]);

  const rows = useMemo(() => {
    const out: Array<{
      overall: number;
      round: number;
      pickInRound: number;
      coach_id: number | null;
      coach_name: string;
      player: Player | null;
    }> = [];

    for (let overall = 1; overall <= totalOverall; overall++) {
      const round = Math.floor((overall - 1) / coachCount) + 1;
      const pickInRound = ((overall - 1) % coachCount) + 1;

      const coach_id = draftOrderByOverall.get(overall) ?? null;
      const coach_name = coach_id ? coachNameById.get(coach_id) ?? `Coach ${coach_id}` : "";

      const player = draftedByOverall.get(overall) ?? null;

      out.push({ overall, round, pickInRound, coach_id, coach_name, player });
    }

    return out;
  }, [totalOverall, coachCount, draftOrderByOverall, coachNameById, draftedByOverall]);

  const statusLine = useMemo(() => {
    if (!state) return `Room ${room} • Loading…`;
    const base = `Room ${room} • Round ${state.current_round}/${state.rounds_total} • Pick ${state.current_pick_in_round}/${coachCount} • On the clock: ${
      coachNameById.get(state.current_coach_id) ?? `Coach ${state.current_coach_id}`
    }`;
    const live = state.is_paused ? "PAUSED" : "LIVE";
    return `${base} • ${live}`;
  }, [state, room, coachCount, coachNameById]);

  useEffect(() => {
    if (!currentOverall) return;
    const wrap = scrollWrapRef.current;
    const row = currentRowRef.current;
    if (!wrap || !row) return;

    const offset = 90;
    const top = row.offsetTop - offset;

    wrap.scrollTo({
      top: top < 0 ? 0 : top,
      behavior: "smooth",
    });
  }, [currentOverall]);

  // --- Polished UI styles ---
  const pageBg = "#f3f4f6";

  const card: React.CSSProperties = {
    background: "white",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    border: "1px solid #eee",
  };

  const btn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "white",
    color: "#111",
    fontWeight: 800,
    cursor: "pointer",
  };

  const btnDark: React.CSSProperties = {
    ...btn,
    background: "#111",
    color: "white",
  };

  const cellPad = bigMode ? 14 : 10;
  const fontSize = bigMode ? 15 : 13;
  const headerFont = bigMode ? 18 : 16;

  return (
    <div style={{ minHeight: "100vh", background: pageBg, padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Top status card */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: headerFont, fontWeight: 900 }}>{statusLine}</div>
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                {state?.is_paused ? pauseReasonLabel(state.pause_reason) ?? "Paused" : "Live Draft Board"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setBigMode((v) => !v)}
                style={btnDark}
                type="button"
              >
                {bigMode ? "Switch to Normal View" : "Switch to Big TV View"}
              </button>

              <button onClick={() => router.push(`/join?room=${room}`)} style={btn} type="button">
                Back to Join
              </button>

              <button onClick={() => router.push(`/admin?room=${room}`)} style={btn} type="button">
                Admin
              </button>
            </div>
          </div>
        </div>

        {/* Table card */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>Draft Board</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Open on a TV: <code>/board?room={room}</code>
            </div>
          </div>

          <div
            ref={scrollWrapRef}
            style={{
              marginTop: 12,
              maxHeight: "76vh",
              overflowY: "auto",
              overflowX: "auto",
              borderRadius: 12,
              border: "1px solid #eee",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize }}>
              <thead>
                <tr
                  style={{
                    background: "#111",
                    color: "white",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                  }}
                >
                  <th style={{ textAlign: "left", padding: cellPad, borderBottom: "1px solid #333" }}>Overall</th>
                  <th style={{ textAlign: "left", padding: cellPad, borderBottom: "1px solid #333" }}>Round</th>
                  <th style={{ textAlign: "left", padding: cellPad, borderBottom: "1px solid #333" }}>Pick</th>
                  <th style={{ textAlign: "left", padding: cellPad, borderBottom: "1px solid #333" }}>Coach</th>
                  <th style={{ textAlign: "left", padding: cellPad, borderBottom: "1px solid #333" }}>Player #</th>
                  <th style={{ textAlign: "left", padding: cellPad, borderBottom: "1px solid #333" }}>Player</th>
                  <th style={{ textAlign: "left", padding: cellPad, borderBottom: "1px solid #333" }}>Pos</th>
                  <th style={{ textAlign: "left", padding: cellPad, borderBottom: "1px solid #333" }}>Club</th>
                  <th style={{ textAlign: "left", padding: cellPad, borderBottom: "1px solid #333" }}>Avg</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r, idx) => {
                  const isCurrent = currentOverall === r.overall;
                  const picked = !!r.player;

                  const bg = isCurrent ? "#ffe08a" : idx % 2 === 0 ? "white" : "#fafafa";

                  return (
                    <tr
                      key={r.overall}
                      ref={isCurrent ? currentRowRef : null}
                      style={{
                        background: bg,
                        outline: isCurrent ? "3px solid #c77d00" : "none",
                      }}
                    >
                      <td style={{ padding: cellPad, borderBottom: "1px solid #eee", width: 140, color: "#000" }}>
                        <strong style={{ fontSize: bigMode ? 18 : 14 }}>{r.overall}</strong>
                        {isCurrent ? (
                          <span
                            style={{
                              marginLeft: 10,
                              fontSize: bigMode ? 12 : 11,
                              fontWeight: 900,
                              background: "#111",
                              color: "#ff2b2b",
                              padding: "4px 8px",
                              borderRadius: 999,
                              letterSpacing: 1,
                            }}
                          >
                            ON CLOCK
                          </span>
                        ) : null}
                      </td>

                      <td style={{ padding: cellPad, borderBottom: "1px solid #eee", width: 80, color: "#000" }}>
                        {r.round}
                      </td>

                      <td style={{ padding: cellPad, borderBottom: "1px solid #eee", width: 80, color: "#000" }}>
                        {r.pickInRound}
                      </td>

                      <td style={{ padding: cellPad, borderBottom: "1px solid #eee", minWidth: 220, color: "#000" }}>
                        <strong style={{ fontSize: bigMode ? 16 : 13 }}>
                          {r.coach_name || (r.coach_id ? `Coach ${r.coach_id}` : "")}
                        </strong>
                      </td>

                      <td style={{ padding: cellPad, borderBottom: "1px solid #eee", width: 110, color: "#000" }}>
                        {picked ? r.player!.player_no : ""}
                      </td>

                      <td style={{ padding: cellPad, borderBottom: "1px solid #eee", minWidth: 240, color: "#000" }}>
                        {picked ? (
                          <strong style={{ fontSize: bigMode ? 16 : 13 }}>{r.player!.player_name}</strong>
                        ) : (
                          <span style={{ opacity: 0.35 }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: cellPad, borderBottom: "1px solid #eee", width: 90, color: "#000" }}>
                        {picked ? r.player!.pos : ""}
                      </td>

                      <td style={{ padding: cellPad, borderBottom: "1px solid #eee", width: 130, color: "#000" }}>
                        {picked ? r.player!.club : ""}
                      </td>

                      <td style={{ padding: cellPad, borderBottom: "1px solid #eee", width: 90, color: "#000" }}>
                        {picked ? r.player!.average : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            Tip: Add <code>&big=0</code> later if you want a URL toggle — we can do that next.
          </div>
        </div>
      </div>
    </div>
  );
}
