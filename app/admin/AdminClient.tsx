"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DraftClient from "../draft/DraftClient";
import { supabase } from "../lib/supabase";
import { Page, Card, Button, SmallText } from "../ui/ui";

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
  room_id: string;
  coach_id: number;
  coach_name: string;
  session_id: string | null;
};

type DraftOrderRow = {
  room_id: string;
  overall_pick: number;
  coach_id: number;
};

const BLOCKS = [
  { label: "Rounds 1–2", from: 1, to: 2 },
  { label: "Rounds 3–10", from: 3, to: 10 },
  { label: "Rounds 11–20", from: 11, to: 20 },
  { label: "Rounds 21–30", from: 21, to: 30 },
  { label: "Rounds 31–40", from: 31, to: 40 },
  { label: "Rounds 41–46", from: 41, to: 46 },
] as const;

const ROOM_DISPLAY_NAME = "Super8 Draft";

function pauseReasonLabel(pause_reason: string | null) {
  if (!pause_reason) return null;
  if (pause_reason.startsWith("WAIT_BLOCK_")) {
    const block = pause_reason.replace("WAIT_BLOCK_", "");
    return `Waiting for Admin to set draft order for rounds ${block}…`;
  }
  return pause_reason;
}

async function postJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export default function AdminClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const roomFromUrl = sp.get("room") || "";

  // ✅ split "what you type" vs "what the app uses"
  const [roomIdInput, setRoomIdInput] = useState(roomFromUrl || "DUMMY1");
  const [roomId, setRoomId] = useState((roomFromUrl || "DUMMY1").trim());

  const [blockIdx, setBlockIdx] = useState(0);

  // generator controls
  const [coachIdsStr, setCoachIdsStr] = useState("1,2,3,4,5,6,7,8");
  const [shuffle, setShuffle] = useState(false);
  const [seed, setSeed] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // manual editor state
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [draftOrder, setDraftOrder] = useState<DraftOrderRow[]>([]);
  const [loadErr, setLoadErr] = useState<string>("");

  // local edits: overall_pick -> coach_id
  const [edits, setEdits] = useState<Record<number, number>>({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // reset block button busy
  const [resetBusy, setResetBusy] = useState(false);

  // ✅ pro toggle
  const [autoSaveAfterReset, setAutoSaveAfterReset] = useState(true);

  // ✅ debug toggle (hides the noisy room-id stuff by default)
  const [showDebug, setShowDebug] = useState(false);

  // force refresh of embedded DraftClient after save/generate/admin actions
  const [refreshKey, setRefreshKey] = useState(0);

  const block = BLOCKS[blockIdx];

  // =========================================================
  // ✅ Draft controls (Start / Pause / Reset)
  // =========================================================

  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [draftStateErr, setDraftStateErr] = useState<string>("");
  const [draftActionBusy, setDraftActionBusy] = useState(false);
  const [draftActionMsg, setDraftActionMsg] = useState<string>("");

  // =========================================================
  // ✅ Simulator + Export tools
  // =========================================================
  const [toolsBusy, setToolsBusy] = useState(false);
  const [toolsMsg, setToolsMsg] = useState("");

  // =========================================================
  // ✅ Shared field styles (fix unreadable dark inputs)
  // =========================================================
  const fieldBase: React.CSSProperties = {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111",
    outline: "none",
  };

  async function simulate2CoachDraft() {
    setToolsMsg("");
    if (!roomId.trim()) return setToolsMsg("Room id is required.");

    const ok = window.confirm(
      `Simulate a FULL draft for 2 coaches in room "${roomId.trim()}"?\n\nThis will make many picks and write them to draft_picks.\nMake sure the room is intended for 2-coach sim.`
    );
    if (!ok) return;

    setToolsBusy(true);
    try {
      const { res, json } = await postJson("/api/admin/simulate-draft", {
        roomId: roomId.trim(),
        coachIds: [1, 2],
        rounds: 46,
        pickRule: "highest_average",
      });

      if (!res.ok || !json?.ok) {
        setToolsMsg(`Sim failed: ${json?.error || json?.message || "Unknown error"}`);
      } else {
        setToolsMsg(`✅ Sim complete: ${json?.picksDone ?? 0} picks (${json?.message || "done"})`);
        await loadDraftState(roomId.trim());
        await loadData(roomId.trim());
        setRefreshKey((k) => k + 1);
      }
    } catch (e: any) {
      setToolsMsg(`Sim failed: ${e?.message || String(e)}`);
    } finally {
      setToolsBusy(false);
    }
  }

  function exportPicksCsv() {
    setToolsMsg("");
    if (!roomId.trim()) return setToolsMsg("Room id is required.");
    window.open(`/api/admin/export-picks?room=${encodeURIComponent(roomId.trim())}`, "_blank");
  }

  async function loadDraftState(room: string) {
    setDraftStateErr("");
    if (!room.trim()) {
      setDraftState(null);
      return;
    }

    const { data, error } = await supabase
      .from("draft_state")
      .select(
        "room_id,is_paused,pause_reason,rounds_total,current_round,current_pick_in_round,current_coach_id"
      )
      .eq("room_id", room.trim())
      .maybeSingle();

    if (error) {
      setDraftStateErr(`draft_state load error: ${error.message}`);
      setDraftState(null);
      return;
    }

    setDraftState((data as DraftState) || null);
  }

  useEffect(() => {
    if (!roomId.trim()) return;

    loadDraftState(roomId.trim());

    const ch = supabase.channel(`admin_draft_state_${roomId.trim()}`);
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "draft_state", filter: `room_id=eq.${roomId.trim()}` },
      () => loadDraftState(roomId.trim())
    );
    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function startDraft() {
    setDraftActionMsg("");
    if (!roomId.trim()) return setDraftActionMsg("Room id is required.");

    const ok = window.confirm(
      `Start draft for "${ROOM_DISPLAY_NAME}"?\n\nThis should create/initialize draft_state if needed and set draft LIVE.`
    );
    if (!ok) return;

    setDraftActionBusy(true);
    try {
      const { res, json } = await postJson("/api/admin/start-draft", { roomId: roomId.trim() });

      if (!res.ok || !json?.ok) {
        setDraftActionMsg(`Start failed: ${json?.error || json?.message || "Unknown error"}`);
      } else {
        setDraftActionMsg("✅ Draft started");
        await loadDraftState(roomId.trim());
        setRefreshKey((k) => k + 1);
      }
    } catch (e: any) {
      setDraftActionMsg(`Start failed: ${e?.message || String(e)}`);
    } finally {
      setDraftActionBusy(false);
    }
  }

  async function pauseDraft(nextPaused: boolean) {
    setDraftActionMsg("");
    if (!roomId.trim()) return setDraftActionMsg("Room id is required.");

    const ok = window.confirm(
      nextPaused ? `Pause draft for "${ROOM_DISPLAY_NAME}"?` : `Resume draft for "${ROOM_DISPLAY_NAME}"?`
    );
    if (!ok) return;

    setDraftActionBusy(true);
    try {
      const { res, json } = await postJson("/api/admin/pause-draft", {
        roomId: roomId.trim(),
        is_paused: nextPaused,
        pause_reason: nextPaused ? "Paused by Admin" : null,
      });

      if (!res.ok || !json?.ok) {
        setDraftActionMsg(`Pause/resume failed: ${json?.error || json?.message || "Unknown error"}`);
      } else {
        setDraftActionMsg(nextPaused ? "⏸️ Draft paused" : "▶️ Draft resumed");
        await loadDraftState(roomId.trim());
        setRefreshKey((k) => k + 1);
      }
    } catch (e: any) {
      setDraftActionMsg(`Pause/resume failed: ${e?.message || String(e)}`);
    } finally {
      setDraftActionBusy(false);
    }
  }

  async function resetDraft() {
    setDraftActionMsg("");
    if (!roomId.trim()) return setDraftActionMsg("Room id is required.");

    const ok = window.confirm(
      `RESET the draft for "${ROOM_DISPLAY_NAME}"?\n\nThis should reset draft_state + clear drafted players (depending on your RPC/route).\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setDraftActionBusy(true);
    try {
      const { res, json } = await postJson("/api/admin/reset-draft", { roomId: roomId.trim() });

      if (!res.ok || !json?.ok) {
        setDraftActionMsg(`Reset failed: ${json?.error || json?.message || "Unknown error"}`);
      } else {
        setDraftActionMsg("♻️ Draft reset");
        await loadDraftState(roomId.trim());
        await loadData(roomId.trim());
        setRefreshKey((k) => k + 1);
      }
    } catch (e: any) {
      setDraftActionMsg(`Reset failed: ${e?.message || String(e)}`);
    } finally {
      setDraftActionBusy(false);
    }
  }

  const draftStatus = useMemo(() => {
    if (!draftState) return "No draft_state row yet";
    const live = draftState.is_paused ? "PAUSED" : "LIVE";
    return `${live} • Round ${draftState.current_round}/${draftState.rounds_total} • Pick ${draftState.current_pick_in_round} • Coach ${draftState.current_coach_id}`;
  }, [draftState]);

  // =========================================================
  // ✅ Apply the room (only then do DB calls + DraftClient refresh)
  // =========================================================

  function applyRoom(nextRoom?: string) {
    const next = (nextRoom ?? roomIdInput).trim();
    if (!next) return;

    setRoomId(next);

    const coach = sp.get("coach");
    const qs = new URLSearchParams();
    qs.set("room", next);
    if (coach) qs.set("coach", coach);

    router.replace(`/admin?${qs.toString()}`);
  }

  const coachIdsParsed = useMemo(() => {
    return coachIdsStr
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }, [coachIdsStr]);

  const coachesSorted = useMemo(() => {
    return [...coaches].sort((a, b) => a.coach_id - b.coach_id);
  }, [coaches]);

  const coachNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of coachesSorted) m.set(c.coach_id, c.coach_name);
    return m;
  }, [coachesSorted]);

  const inferredCoachIds = useMemo(() => {
    const s = new Set<number>();
    for (const r of draftOrder) s.add(r.coach_id);
    return Array.from(s).sort((a, b) => a - b);
  }, [draftOrder]);

  const coachOptions = useMemo(() => {
    if (coachesSorted.length) {
      return coachesSorted.map((c) => ({ id: c.coach_id, name: c.coach_name }));
    }
    return inferredCoachIds.map((id) => ({ id, name: `Coach ${id}` }));
  }, [coachesSorted, inferredCoachIds]);

  const nCoaches = coachOptions.length;

  const draftOrderByPick = useMemo(() => {
    const m = new Map<number, number>();
    for (const row of draftOrder) m.set(row.overall_pick, row.coach_id);
    return m;
  }, [draftOrder]);

  function overallPick(round: number, pickInRound: number) {
    return (round - 1) * nCoaches + pickInRound;
  }

  async function loadData(room: string) {
    setLoadErr("");
    setSaveMsg("");
    setEdits({});

    if (!room.trim()) return;

    const [cRes, oRes] = await Promise.all([
      supabase
        .from("coaches")
        .select("room_id,coach_id,coach_name,session_id")
        .eq("room_id", room)
        .order("coach_id", { ascending: true }),
      supabase
        .from("draft_order")
        .select("room_id,overall_pick,coach_id")
        .eq("room_id", room)
        .order("overall_pick", { ascending: true }),
    ]);

    if (cRes.error) {
      setLoadErr(`Coaches load error: ${cRes.error.message}`);
      setCoaches([]);
    } else {
      setCoaches((cRes.data as Coach[]) || []);
    }

    if (oRes.error) {
      setLoadErr((prev) => (prev ? prev + "\n" : "") + `Draft order load error: ${oRes.error.message}`);
      setDraftOrder([]);
    } else {
      setDraftOrder((oRes.data as DraftOrderRow[]) || []);
    }
  }

  useEffect(() => {
    loadData(roomId.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function generate() {
    setMsg("");
    setSaveMsg("");
    if (!roomId.trim()) return setMsg("Room id is required.");
    if (coachIdsParsed.length === 0) return setMsg("Coach IDs list is empty/invalid.");

    setBusy(true);
    try {
      const res = await fetch("/api/admin/generate-snake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId.trim(),
          round_from: block.from,
          round_to: block.to,
          coach_ids: coachIdsParsed,
          shuffle,
          seed: seed.trim() === "" ? null : Number(seed),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setMsg(`Failed: ${json?.error || json?.message || "Unknown error"}`);
      } else {
        setMsg(`✅ Generated snake order for ${block.label}`);
        await loadData(roomId.trim());
        setRefreshKey((k) => k + 1);
      }
    } catch (e: any) {
      setMsg(`Server error: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const blockGrid = useMemo(() => {
    if (!nCoaches) return null;

    const rounds: { round: number; cells: any[] }[] = [];
    for (let r = block.from; r <= block.to; r++) {
      const cells = [];
      for (let p = 1; p <= nCoaches; p++) {
        const op = overallPick(r, p);
        const current = edits[op] ?? draftOrderByPick.get(op) ?? null;
        cells.push({ round: r, pickInRound: p, overallPick: op, coachId: current });
      }
      rounds.push({ round: r, cells });
    }
    return rounds;
  }, [block.from, block.to, nCoaches, edits, draftOrderByPick]);

  function blockOverallPickRange() {
    const start = (block.from - 1) * nCoaches + 1;
    const end = block.to * nCoaches;
    return { start, end };
  }

  function baseIndexForCell(round: number, pickInRound: number) {
    const n = nCoaches;
    if (round % 2 === 1) return pickInRound - 1;
    return n - pickInRound;
  }

  function buildBaseOrderFromPickMap(pickMap: Map<number, number>) {
    const n = nCoaches;
    const baseOrder: (number | null)[] = Array.from({ length: n }, () => null);

    const r = block.from;
    for (let p = 1; p <= n; p++) {
      const op = overallPick(r, p);
      const cid = pickMap.get(op) ?? null;
      const idx = baseIndexForCell(r, p);
      baseOrder[idx] = cid;
    }

    return baseOrder;
  }

  function buildFullBlockEditsFromBaseOrder(baseOrder: (number | null)[]) {
    const n = nCoaches;
    const next: Record<number, number> = {};

    for (let r = block.from; r <= block.to; r++) {
      for (let p = 1; p <= n; p++) {
        const op = overallPick(r, p);
        const idx = baseIndexForCell(r, p);
        const desired = baseOrder[idx];
        if (desired != null) next[op] = desired;
      }
    }

    return next;
  }

  function getCurrentCoachId(op: number, prev: Record<number, number>) {
    return prev[op] ?? draftOrderByPick.get(op) ?? null;
  }

  function buildBaseOrder(prev: Record<number, number>) {
    const n = nCoaches;
    const baseOrder: (number | null)[] = Array.from({ length: n }, () => null);

    const r = block.from;
    for (let p = 1; p <= n; p++) {
      const op = overallPick(r, p);
      const cid = getCurrentCoachId(op, prev);
      const idx = baseIndexForCell(r, p);
      baseOrder[idx] = cid;
    }

    return baseOrder;
  }

  function regenerateBlockEdits(prev: Record<number, number>, baseOrder: (number | null)[]) {
    const n = nCoaches;
    const next = { ...prev };

    for (let r = block.from; r <= block.to; r++) {
      for (let p = 1; p <= n; p++) {
        const op = overallPick(r, p);
        const idx = baseIndexForCell(r, p);
        const desired = baseOrder[idx];

        if (desired != null) next[op] = desired;
        else {
          const existing = getCurrentCoachId(op, prev);
          if (existing != null) next[op] = existing;
        }
      }
    }

    return next;
  }

  function setCell(overall_pick: number, newCoachId: number) {
    if (!nCoaches) return;
    if (resetBusy || saveBusy) return;

    setEdits((prev) => {
      const n = nCoaches;

      const round = Math.floor((overall_pick - 1) / n) + 1;
      const pickInRound = ((overall_pick - 1) % n) + 1;

      if (round < block.from || round > block.to) return prev;

      const baseOrder = buildBaseOrder(prev);
      const idx = baseIndexForCell(round, pickInRound);

      if (baseOrder[idx] === newCoachId) return prev;

      const otherIdx = baseOrder.findIndex((cid) => cid === newCoachId);
      const displaced = baseOrder[idx];
      baseOrder[idx] = newCoachId;

      if (otherIdx !== -1) {
        baseOrder[otherIdx] = displaced ?? baseOrder[otherIdx];
      }

      return regenerateBlockEdits(prev, baseOrder);
    });
  }

  async function saveManualEdits() {
    setSaveMsg("");
    if (!roomId.trim()) return setSaveMsg("Room id is required.");
    if (!Object.keys(edits).length) return setSaveMsg("No changes to save.");
    if (!nCoaches) return setSaveMsg("No coaches/columns available.");

    const { start, end } = blockOverallPickRange();

    const updates: { overall_pick: number; coach_id: number }[] = [];
    for (let op = start; op <= end; op++) {
      const cid = edits[op] ?? draftOrderByPick.get(op) ?? null;
      if (cid == null) continue;
      updates.push({ overall_pick: op, coach_id: cid });
    }

    setSaveBusy(true);
    try {
      const res = await fetch("/api/admin/set-draft-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId.trim(),
          updates,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setSaveMsg(`Save failed: ${json?.error || json?.message || "Unknown error"}`);
      } else {
        setSaveMsg(`✅ Saved block ${block.label} (${json.updated ?? updates.length} picks)`);
        setEdits({});
        await loadData(roomId.trim());
        setRefreshKey((k) => k + 1);
      }
    } catch (e: any) {
      setSaveMsg(`Server error: ${e?.message || String(e)}`);
    } finally {
      setSaveBusy(false);
    }
  }

  async function resetBlockToGenerated() {
    if (!roomId.trim()) return;
    if (!nCoaches) return;

    const ok = window.confirm(
      `Reset ${block.label} back to the last generated/saved order?\n\nThis will discard any unsaved edits for this block.${
        autoSaveAfterReset ? "\n\nAuto-save is ON: this will also write to the DB immediately." : ""
      }`
    );
    if (!ok) return;

    setResetBusy(true);
    setSaveMsg("");
    setMsg("");

    try {
      setEdits({});

      const { start, end } = blockOverallPickRange();

      const { data, error } = await supabase
        .from("draft_order")
        .select("room_id,overall_pick,coach_id")
        .eq("room_id", roomId.trim())
        .gte("overall_pick", start)
        .lte("overall_pick", end)
        .order("overall_pick", { ascending: true });

      if (error) throw new Error(error.message);

      const rows = (data as DraftOrderRow[]) || [];
      const pickMap = new Map<number, number>();
      for (const r of rows) pickMap.set(r.overall_pick, r.coach_id);

      const baseOrder = buildBaseOrderFromPickMap(pickMap);
      const nextEdits = buildFullBlockEditsFromBaseOrder(baseOrder);

      setEdits(nextEdits);

      if (autoSaveAfterReset) {
        const updates: { overall_pick: number; coach_id: number }[] = [];
        for (let op = start; op <= end; op++) {
          const cid = nextEdits[op] ?? pickMap.get(op) ?? null;
          if (cid == null) continue;
          updates.push({ overall_pick: op, coach_id: cid });
        }

        const res = await fetch("/api/admin/set-draft-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: roomId.trim(),
            updates,
          }),
        });

        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || json?.message || "Unknown save error");
        }

        setEdits({});
        setSaveMsg(`♻️ Reset + saved ${block.label} (${json.updated ?? updates.length} picks)`);
      } else {
        setSaveMsg(`♻️ Reset ${block.label} in editor. (Click Save block to write it back if needed)`);
      }

      await loadData(roomId.trim());
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setSaveMsg(`Reset failed: ${e?.message || String(e)}`);
    } finally {
      setResetBusy(false);
    }
  }

  const editorLocked = resetBusy || saveBusy;
  const anyBusy = busy || saveBusy || resetBusy || draftActionBusy || toolsBusy;

  return (
    <Page title="Super8 Draft — Admin" subtitle="Draft control centre">
      {/* ✅ Admin Tools (Debug only) */}
        {showDebug ? (
        <Card
        title="Admin Tools"
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <SmallText>
              Room: <strong>{ROOM_DISPLAY_NAME}</strong>
            </SmallText>
            <Button onClick={() => setShowDebug((v) => !v)} disabled={anyBusy}>
              {showDebug ? "Hide debug" : "Show debug"}
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <SmallText>
              Simulate a 2-coach draft and export picks as CSV (from <code>draft_picks</code>).
            </SmallText>
            {toolsMsg ? <div style={{ marginTop: 10, fontWeight: 950 }}>{toolsMsg}</div> : null}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary" onClick={simulate2CoachDraft} disabled={toolsBusy || !roomId.trim()}>
              {toolsBusy ? "Simulating..." : "Simulate 2-coach draft"}
            </Button>

            <Button onClick={exportPicksCsv} disabled={toolsBusy || !roomId.trim()}>
              Export picks (CSV)
            </Button>
          </div>
        </div>
      </Card>
        ) : null}

      {/* ✅ Debug (hidden by default) */}
      {showDebug ? (
        <Card title="Debug">
          <SmallText>
            Real room id in use:{" "}
            <span style={{ fontFamily: "monospace", fontWeight: 950 }}>{roomId.trim() || "(blank)"}</span>
          </SmallText>

          <div style={{ display: "grid", gap: 10, maxWidth: 760, marginTop: 10 }}>
            <label>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Room ID (advanced)</div>
              <input
                suppressHydrationWarning
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyRoom();
                }}
                style={fieldBase}
              />
              <SmallText>Press Enter to load, or click the button below.</SmallText>
            </label>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Button onClick={() => applyRoom()}>Load room</Button>
              <SmallText>
                This is mainly for troubleshooting or running multiple rooms.
              </SmallText>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ✅ Draft Controls */}
      <Card title="Draft Controls">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <SmallText>
              Room: <strong>{ROOM_DISPLAY_NAME}</strong> • Status: <strong>{draftStatus}</strong>
            </SmallText>

            {draftState?.is_paused ? (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                Reason: <strong>{pauseReasonLabel(draftState.pause_reason) ?? "Paused"}</strong>
              </div>
            ) : null}

            {draftStateErr ? (
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 950, color: "#b91c1c" }}>
                {draftStateErr}
              </div>
            ) : null}

            {draftActionMsg ? <div style={{ marginTop: 10, fontWeight: 950 }}>{draftActionMsg}</div> : null}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary" onClick={startDraft} disabled={draftActionBusy || !roomId.trim()}>
              {draftActionBusy ? "Working..." : "Start draft"}
            </Button>

            <Button
              onClick={() => pauseDraft(!(draftState?.is_paused ?? false))}
              disabled={draftActionBusy || !roomId.trim()}
            >
              {draftState?.is_paused ? "Resume draft" : "Pause draft"}
            </Button>

            <Button variant="danger" onClick={resetDraft} disabled={draftActionBusy || !roomId.trim()}>
              Reset draft
            </Button>
          </div>
        </div>
      </Card>

      {/* ✅ Snake generator */}
      <Card title="Snake Generator" right={<SmallText>Room: <strong>{ROOM_DISPLAY_NAME}</strong></SmallText>}>
        <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
          <label>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Block</div>
            <select value={blockIdx} onChange={(e) => setBlockIdx(Number(e.target.value))} style={fieldBase}>
              {BLOCKS.map((b, i) => (
                <option key={b.label} value={i}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Coach IDs (comma separated)</div>
            <input
              suppressHydrationWarning
              value={coachIdsStr}
              onChange={(e) => setCoachIdsStr(e.target.value)}
              style={fieldBase}
            />
            <SmallText>
              Parsed: <strong>[{coachIdsParsed.join(", ")}]</strong>
            </SmallText>
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
            <span style={{ fontWeight: 900 }}>Shuffle coach order for this block</span>
          </label>

          <label>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Seed (optional, number)</div>
            <input
              suppressHydrationWarning
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g. 0.42"
              style={fieldBase}
            />
          </label>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary" onClick={generate} disabled={busy}>
              {busy ? "Generating..." : "Generate snake for selected block"}
            </Button>
            {msg ? <div style={{ fontWeight: 900 }}>{msg}</div> : null}
          </div>
        </div>
      </Card>

      {/* Manual editor */}
      <Card title="Manual Order Editor">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <SmallText>
              Room: <strong>{ROOM_DISPLAY_NAME}</strong> • Block: <strong>{block.label}</strong> • Coaches:{" "}
              <strong>{coachOptions.length}</strong> • Picks loaded: <strong>{draftOrder.length}</strong>
            </SmallText>

            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
              Mode: <strong>Snake regen</strong> — edit one pick and the entire block updates (even rounds reverse).
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <input
                type="checkbox"
                checked={autoSaveAfterReset}
                onChange={(e) => setAutoSaveAfterReset(e.target.checked)}
              />
              <span style={{ fontWeight: 950 }}>Auto-save to DB after reset</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>(one-click “true reset”)</span>
            </label>

            {Object.keys(edits).length > 0 ? (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                Pending: <strong>{Object.keys(edits).length}</strong> edited picks in UI
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button onClick={() => loadData(roomId.trim())} disabled={editorLocked}>
              Refresh
            </Button>

            <Button onClick={resetBlockToGenerated} disabled={resetBusy || saveBusy || busy || !nCoaches}>
              {resetBusy ? `Resetting ${block.label}...` : `Reset block (${block.label})`}
            </Button>

            <Button
              variant="primary"
              onClick={saveManualEdits}
              disabled={saveBusy || Object.keys(edits).length === 0 || resetBusy}
            >
              {saveBusy ? "Saving..." : `Save block (${block.label})`}
            </Button>
          </div>
        </div>

        {loadErr ? (
          <pre style={{ marginTop: 12, padding: 12, background: "#fff5f5", border: "1px solid #f2c2c2" }}>
            {loadErr}
          </pre>
        ) : null}

        {saveMsg ? <div style={{ marginTop: 12, fontWeight: 950 }}>{saveMsg}</div> : null}

        {!coachOptions.length ? (
          <div style={{ marginTop: 12, opacity: 0.9 }}>
            No coach columns available yet. Add coaches for this room or generate at least one draft_order pick.
          </div>
        ) : !blockGrid ? (
          <div style={{ marginTop: 12, opacity: 0.9 }}>Loading…</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Round</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Pick</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Overall</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Coach</th>
                </tr>
              </thead>
              <tbody>
                {blockGrid.flatMap((r) =>
                  r.cells.map((cell) => {
                    const currentName =
                      cell.coachId != null
                        ? coachNameById.get(cell.coachId) ?? `Coach ${cell.coachId}`
                        : "—";
                    const edited = Object.prototype.hasOwnProperty.call(edits, cell.overallPick);

                    return (
                      <tr key={cell.overallPick} style={{ opacity: editorLocked ? 0.95 : 1 }}>
                        <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6", fontWeight: 950 }}>
                          {cell.round}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>{cell.pickInRound}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>#{cell.overallPick}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>
                          <select
                            disabled={editorLocked}
                            value={cell.coachId ?? ""}
                            onChange={(e) => setCell(cell.overallPick, Number(e.target.value))}
                            style={{
                              ...fieldBase,
                              padding: 8,
                              borderRadius: 10,
                              border: edited ? "2px solid #111" : "1px solid #d1d5db",
                              background: editorLocked ? "#f3f4f6" : edited ? "#fff6d6" : "#fff",
                              fontWeight: 900,
                              cursor: editorLocked ? "not-allowed" : "pointer",
                            }}
                          >
                            <option value="" disabled>
                              Select coach…
                            </option>
                            {coachOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>

                          <SmallText>
                            Current: <strong>{currentName}</strong>
                            {edited ? " • edited" : ""}
                            {editorLocked ? " • locked" : ""}
                          </SmallText>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <SmallText>
              Tip: change any pick and the whole block is recalculated as a snake. Then hit <strong>Save block</strong>{" "}
              to write it to <code>draft_order</code>. Use <strong>Reset block</strong> to revert unsaved edits.
            </SmallText>
          </div>
        )}
      </Card>

      {/* Live board preview */}
      <Card
        title="Live Draft Board Preview"
        right={
          <SmallText>
            room: <strong>{ROOM_DISPLAY_NAME}</strong>
            {anyBusy ? <span style={{ marginLeft: 8, opacity: 0.8 }}>• updating…</span> : null}
          </SmallText>
        }
      >
        <DraftClient key={`${roomId.trim()}-${refreshKey}`} />
      </Card>
    </Page>
  );
}