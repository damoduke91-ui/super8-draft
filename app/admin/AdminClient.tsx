"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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

type DraftOrderRow = {
  overall_pick: number;
  coach_id: number;
};

function pauseReasonLabel(pause_reason: string | null) {
  if (!pause_reason) return null;
  if (pause_reason.startsWith("WAIT_BLOCK_")) {
    const block = pause_reason.replace("WAIT_BLOCK_", "");
    return `Waiting for draft order for rounds ${block}…`;
  }
  return "Paused";
}

export default function AdminClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const room = sp.get("room") || "DUMMY1";

  const [state, setState] = useState<DraftState | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [draftOrder, setDraftOrder] = useState<DraftOrderRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [roundsTotalInput, setRoundsTotalInput] = useState<number>(46);

  const loadState = async () => {
    const { data, error } = await supabase
      .from("draft_state")
      .select(
        "room_id,is_paused,pause_reason,rounds_total,current_round,current_pick_in_round,current_coach_id"
      )
      .eq("room_id", room)
      .single();

    if (error) {
      console.error("admin loadState error:", error);
      setState(null);
    } else {
      const st = data as DraftState;
      setState(st);
      setRoundsTotalInput(st.rounds_total ?? 46);
    }
  };

  const loadCoaches = async () => {
    const { data, error } = await supabase
      .from("coaches")
      .select("coach_id,coach_name")
      .eq("room_id", room)
      .order("coach_id");

    if (error) {
      console.error("admin loadCoaches error:", error);
      setCoaches([]);
    } else {
      setCoaches((data as Coach[]) || []);
    }
  };

  const loadDraftOrder = async () => {
    const { data, error } = await supabase
      .from("draft_order")
      .select("overall_pick,coach_id")
      .eq("room_id", room)
      .order("overall_pick");

    if (error) {
      console.error("admin loadDraftOrder error:", error);
      setDraftOrder([]);
    } else {
      setDraftOrder((data as DraftOrderRow[]) || []);
    }
  };

  useEffect(() => {
    loadState();
    loadCoaches();
    loadDraftOrder();

    const s1 = supabase
      .channel(`admin_state_${room}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_state", filter: `room_id=eq.${room}` },
        () => loadState()
      )
      .subscribe();

    const s2 = supabase
      .channel(`admin_coaches_${room}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "coaches", filter: `room_id=eq.${room}` },
        () => loadCoaches()
      )
      .subscribe();

    const s3 = supabase
      .channel(`admin_order_${room}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_order", filter: `room_id=eq.${room}` },
        () => loadDraftOrder()
      )
      .subscribe();

    const poll = setInterval(() => {
      loadState();
      loadCoaches();
      loadDraftOrder();
    }, 1500);

    return () => {
      supabase.removeChannel(s1);
      supabase.removeChannel(s2);
      supabase.removeChannel(s3);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const topLine = useMemo(() => {
    if (!state) return `Room ${room} • Loading…`;
    const live = state.is_paused ? "PAUSED" : "LIVE";
    return `Room ${room} • Round ${state.current_round}/${state.rounds_total} • Pick ${state.current_pick_in_round} • ${live}`;
  }, [state, room]);

  const coachNameById = useMemo(() => {
    const m = new Map<number, string>();
    coaches.forEach((c) => m.set(c.coach_id, c.coach_name));
    return m;
  }, [coaches]);

  // --- UI styles (matches Board polish) ---
  const pageBg = "#f3f4f6";

  const card: CSSProperties = {
    background: "white",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    border: "1px solid #eee",
  };

  const btn: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "white",
    color: "#111",
    fontWeight: 800,
    cursor: "pointer",
  };

  const btnDark: CSSProperties = {
    ...btn,
    background: "#111",
    color: "white",
  };

  const btnDanger: CSSProperties = {
    ...btn,
    border: "1px solid #b91c1c",
    color: "#b91c1c",
  };

  const input: CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    outline: "none",
    fontWeight: 700,
    width: 120,
  };

  // -------------------------
  // Actions (NO RPC — because only draft_pick exists)
  // -------------------------

  const setPaused = async (paused: boolean) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("draft_state")
        .update({
          is_paused: paused,
          pause_reason: paused ? "Paused" : null,
        })
        .eq("room_id", room);

      if (error) {
        console.error("admin setPaused error:", error);
        alert("Pause update failed: " + error.message);
        return;
      }

      await loadState();
    } finally {
      setBusy(false);
    }
  };

  const setRoundsTotal = async () => {
    if (!Number.isFinite(roundsTotalInput) || roundsTotalInput < 1 || roundsTotalInput > 200) {
      alert("Rounds total must be between 1 and 200.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase
        .from("draft_state")
        .update({ rounds_total: roundsTotalInput })
        .eq("room_id", room);

      if (error) {
        console.error("admin setRoundsTotal error:", error);
        alert("Rounds update failed: " + error.message);
        return;
      }

      await loadState();
    } finally {
      setBusy(false);
    }
  };

  const resetDraft = async () => {
    if (!confirm("Reset the draft for this room? This cannot be undone.")) return;

    setBusy(true);
    try {
      // 1) Undraft all players in this room
      const { error: e1 } = await supabase
        .from("players")
        .update({
          drafted_by_coach_id: null,
          drafted_round: null,
          drafted_pick: null,
        })
        .eq("room_id", room);

      if (e1) {
        console.error("admin reset players error:", e1);
        alert("Reset failed (players): " + e1.message);
        return;
      }

      // 2) Clear draft order for this room
      const { error: e2 } = await supabase.from("draft_order").delete().eq("room_id", room);
      if (e2) {
        console.error("admin reset draft_order error:", e2);
        alert("Reset failed (draft order): " + e2.message);
        return;
      }

      // 3) Reset draft state
      const nextCoachId =
        coaches.length > 0 ? coaches.slice().sort((a, b) => a.coach_id - b.coach_id)[0].coach_id : 1;

      const { error: e3 } = await supabase
        .from("draft_state")
        .update({
          is_paused: true,
          pause_reason: null,
          current_round: 1,
          current_pick_in_round: 1,
          current_coach_id: nextCoachId,
        })
        .eq("room_id", room);

      if (e3) {
        console.error("admin reset draft_state error:", e3);
        alert("Reset failed (draft state): " + e3.message);
        return;
      }

      await loadState();
      await loadDraftOrder();
    } finally {
      setBusy(false);
    }
  };

  const orderSummary = useMemo(() => {
    if (!draftOrder.length) return "No draft order set yet.";
    const first = draftOrder
      .slice(0, 10)
      .map((r) => coachNameById.get(r.coach_id) ?? `Coach ${r.coach_id}`);
    return `Order loaded • First picks: ${first.join(", ")}${draftOrder.length > 10 ? "…" : ""}`;
  }, [draftOrder, coachNameById]);

  return (
    <div style={{ minHeight: "100vh", background: pageBg, padding: 20 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Top card */}
        <div style={card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Admin</div>
              <div style={{ marginTop: 6, fontWeight: 800 }}>{topLine}</div>
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                {state?.is_paused
                  ? pauseReasonLabel(state.pause_reason) ?? "Paused"
                  : "Live — use controls below to manage the room"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => router.push(`/join?room=${room}`)} style={btn} type="button">
                Back to Join
              </button>
              <button onClick={() => router.push(`/board?room=${room}`)} style={btn} type="button">
                Board
              </button>
              <button onClick={() => router.push(`/draft?room=${room}&coach=1`)} style={btn} type="button">
                Draft (Coach 1)
              </button>
            </div>
          </div>
        </div>

        {/* Controls grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Draft controls */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 10 }}>Draft Controls</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <button
                style={state?.is_paused ? btnDark : btn}
                type="button"
                disabled={busy}
                onClick={() => setPaused(true)}
              >
                Pause
              </button>

              <button
                style={!state?.is_paused ? btnDark : btn}
                type="button"
                disabled={busy}
                onClick={() => setPaused(false)}
              >
                Resume
              </button>

              <button style={btnDanger} type="button" disabled={busy} onClick={resetDraft}>
                Reset Draft
              </button>

              {busy ? <span style={{ fontSize: 12, opacity: 0.75 }}>Working…</span> : null}
            </div>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Note: Your database currently only has the <code>draft_pick</code> RPC. Admin actions here use direct table
              updates.
            </div>
          </div>

          {/* Room setup */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 10 }}>Room Setup</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 800 }}>Rounds total</div>
              <input
                style={input}
                type="number"
                min={1}
                max={200}
                value={roundsTotalInput}
                onChange={(e) => setRoundsTotalInput(Number(e.target.value))}
              />
              <button style={btnDark} type="button" disabled={busy} onClick={setRoundsTotal}>
                Save
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Current: <strong>{state?.rounds_total ?? "—"}</strong> rounds
            </div>
          </div>

          {/* Coaches */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 10 }}>Coaches</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {coaches.length ? (
                coaches.map((c) => (
                  <div
                    key={c.coach_id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: 10,
                      border: "1px solid #eee",
                      borderRadius: 12,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{c.coach_name}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>ID: {c.coach_id}</div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 13, opacity: 0.7 }}>No coaches found for this room yet.</div>
              )}
            </div>
          </div>

          {/* Draft order */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 10 }}>Draft Order</div>

            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{orderSummary}</div>

            <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #eee", borderRadius: 12 }}>
              {draftOrder.length ? (
                draftOrder.map((r) => (
                  <div
                    key={r.overall_pick}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>Pick {r.overall_pick}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {coachNameById.get(r.coach_id) ?? `Coach ${r.coach_id}`}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>No draft order rows yet.</div>
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              If you want a “Set Draft Order” UI (snake / custom), we can add it next.
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          URL tips: <code>/admin?room=YOURROOM</code> • <code>/board?room=YOURROOM</code> •{" "}
          <code>/draft?room=YOURROOM&amp;coach=1</code>
        </div>
      </div>
    </div>
  );
}
