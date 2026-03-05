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

const BLOCKS = [
  { label: "Rounds 1–2", from: 1, to: 2 },
  { label: "Rounds 3–10", from: 3, to: 10 },
  { label: "Rounds 11–20", from: 11, to: 20 },
  { label: "Rounds 21–30", from: 21, to: 30 },
  { label: "Rounds 31–40", from: 31, to: 40 },
  { label: "Rounds 41–46", from: 41, to: 46 },
] as const;

const ROOM_DISPLAY_NAME = "Super8 Draft";

// Proxy pick tabs (same concept as DraftClient)
const POS_TABS = ["ALL", "KD", "DEF", "MID", "FOR", "KF", "RUC"] as const;
type PosTab = (typeof POS_TABS)[number];

const POS_LABEL: Record<PosTab, string> = {
  ALL: "All",
  KD: "KD",
  DEF: "DEF",
  MID: "MID",
  FOR: "FOR",
  KF: "KF",
  RUC: "RUC",
};

function pauseReasonLabel(pause_reason: string | null) {
  if (!pause_reason) return null;
  if (pause_reason.startsWith("WAIT_BLOCK_")) {
    const block = pause_reason.replace("WAIT_BLOCK_", "");
    return `Waiting for Admin to set draft order for rounds ${block}…`;
  }
  return pause_reason;
}

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

function splitPos(posRaw: string): string[] {
  return (posRaw || "")
    .split("/")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function matchesTab(player: Player, tab: PosTab): boolean {
  const tags = splitPos(player.pos);
  if (tab === "ALL") return true;

  if (tab === "DEF") return tags.includes("DEF") && !tags.includes("KD");
  if (tab === "FOR") return tags.includes("FOR") && !tags.includes("KF");

  if (tab === "KD") return tags.includes("KD");
  if (tab === "KF") return tags.includes("KF");

  return tags.includes(tab);
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

  const [roomIdInput, setRoomIdInput] = useState(roomFromUrl || "DUMMY1");
  const [roomId, setRoomId] = useState((roomFromUrl || "DUMMY1").trim());

  const [blockIdx, setBlockIdx] = useState(0);

  const [coachIdsStr, setCoachIdsStr] = useState("1,2,3,4,5,6,7,8");
  const [shuffle, setShuffle] = useState(false);
  const [seed, setSeed] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [draftOrder, setDraftOrder] = useState<DraftOrderRow[]>([]);
  const [loadErr, setLoadErr] = useState<string>("");

  const [edits, setEdits] = useState<Record<number, number>>({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [resetBusy, setResetBusy] = useState(false);

  const [autoSaveAfterReset, setAutoSaveAfterReset] = useState(true);

  const [showDebug, setShowDebug] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const block = BLOCKS[blockIdx];

  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [draftStateErr, setDraftStateErr] = useState<string>("");
  const [draftActionBusy, setDraftActionBusy] = useState(false);
  const [draftActionMsg, setDraftActionMsg] = useState<string>("");

  const [toolsBusy, setToolsBusy] = useState(false);
  const [toolsMsg, setToolsMsg] = useState("");

  const [proxyCoachId, setProxyCoachId] = useState<number>(1);
  const [proxyMsg, setProxyMsg] = useState<string>("");
  const [proxyBusy, setProxyBusy] = useState(false);
  const [proxyErr, setProxyErr] = useState<string>("");
  const [proxyPlayers, setProxyPlayers] = useState<Player[]>([]);
  const [proxyTab, setProxyTab] = useState<PosTab>("ALL");
  const [proxySearch, setProxySearch] = useState("");
  const [proxySortKey, setProxySortKey] = useState<"player_no" | "player_name" | "club" | "average">("average");
  const [proxySortDir, setProxySortDir] = useState<"asc" | "desc">("desc");
  const [proxyShowDrafted, setProxyShowDrafted] = useState(false);

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
        await loadProxyPlayers(roomId.trim());
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
      .select("room_id,is_paused,pause_reason,rounds_total,current_round,current_pick_in_round,current_coach_id")
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
        await loadProxyPlayers(roomId.trim());
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
        await loadProxyPlayers(roomId.trim());
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

  useEffect(() => {
    if (!coachOptions.length) return;
    const has = coachOptions.some((c) => c.id === proxyCoachId);
    if (!has) setProxyCoachId(coachOptions[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachOptions.length]);

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

  async function loadProxyPlayers(room: string) {
    setProxyErr("");
    if (!room.trim()) {
      setProxyPlayers([]);
      return;
    }

    const { data, error } = await supabase
      .from("players")
      .select("player_no,pos,club,player_name,average,drafted_by_coach_id,drafted_round,drafted_pick")
      .eq("room_id", room.trim());

    if (error) {
      setProxyErr(`Players load error: ${error.message}`);
      setProxyPlayers([]);
      return;
    }

    setProxyPlayers((data as Player[]) || []);
  }

  useEffect(() => {
    loadProxyPlayers(roomId.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (!roomId.trim()) return;
    loadProxyPlayers(roomId.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const proxyCoachName = useMemo(() => {
    const found = coachOptions.find((c) => c.id === proxyCoachId);
    return found?.name ?? `Coach ${proxyCoachId}`;
  }, [coachOptions, proxyCoachId]);

  const proxyFiltered = useMemo(() => {
    let list = proxyPlayers;

    if (!proxyShowDrafted) list = list.filter((p) => p.drafted_by_coach_id == null);
    list = list.filter((p) => matchesTab(p, proxyTab));

    const q = norm(proxySearch);
    if (q) {
      list = list.filter((p) => {
        const hay = [String(p.player_no), p.player_name, p.club, p.pos, String(p.average ?? "")]
          .map(norm)
          .join(" | ");
        return hay.includes(q);
      });
    }

    list = list.slice().sort((a, b) => {
      const dir = proxySortDir === "asc" ? 1 : -1;
      if (proxySortKey === "player_no") return (a.player_no - b.player_no) * dir;
      if (proxySortKey === "average") return ((a.average ?? 0) - (b.average ?? 0)) * dir;
      if (proxySortKey === "club") return a.club.localeCompare(b.club) * dir;
      return a.player_name.localeCompare(b.player_name) * dir;
    });

    return list;
  }, [proxyPlayers, proxyShowDrafted, proxyTab, proxySearch, proxySortKey, proxySortDir]);

  function toggleProxySort(key: typeof proxySortKey) {
    if (key === proxySortKey) setProxySortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setProxySortKey(key);
      setProxySortDir(key === "average" ? "desc" : "asc");
    }
  }

  async function proxyDraftPlayer(p: Player) {
    setProxyMsg("");
    setProxyErr("");

    const room = roomId.trim();
    if (!room) return setProxyErr("Room id is required.");
    if (!draftState) return setProxyErr("Draft not started yet (no draft_state row). Start the draft first.");
    if (draftState.is_paused) return setProxyErr(pauseReasonLabel(draftState.pause_reason) ?? "Draft is paused.");
    if (proxyBusy) return;
    if (p.drafted_by_coach_id != null) return setProxyErr("That player is already drafted.");

    const ok = window.confirm(
      `Draft this player for ${proxyCoachName}?\n\n#${p.player_no} — ${p.player_name}\n${p.club} • ${p.pos} • Avg ${p.average}\n\nThis uses ADMIN override for absent-coach emergencies.`
    );
    if (!ok) return;

    setProxyBusy(true);
    try {
      const { data, error } = await supabase.rpc("draft_pick", {
        p_room_id: room,
        p_player_no: p.player_no,
        p_coach_id: proxyCoachId,
        p_override_turn: true,
      });

      if (error) {
        setProxyErr(`Draft failed: ${error.message}`);
        return;
      }

      const res = Array.isArray(data) ? data[0] : data;
      if (!res?.ok) {
        setProxyErr(`Draft failed: ${res?.message ?? "Unknown error"}`);
        return;
      }

      setProxyMsg(`✅ Drafted #${p.player_no} (${p.player_name}) for ${proxyCoachName}`);
      await loadDraftState(room);
      await loadProxyPlayers(room);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setProxyErr(`Draft failed: ${e?.message || String(e)}`);
    } finally {
      setProxyBusy(false);
    }
  }

  const editorLocked = resetBusy || saveBusy;
  const anyBusy = busy || saveBusy || resetBusy || draftActionBusy || toolsBusy || proxyBusy;

  return (
    <Page title="Super8 Draft — Admin" subtitle="Draft control centre">
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

      <Card
        title="Admin Proxy Pick (Absent Coach)"
        right={
          <SmallText>
            room: <strong>{ROOM_DISPLAY_NAME}</strong>
            {proxyBusy ? <span style={{ marginLeft: 8, opacity: 0.8 }}>• drafting…</span> : null}
          </SmallText>
        }
      >
        <SmallText>
          Use only if a coach is absent. This drafts on their behalf on the <strong>Admin screen</strong> (no new page).
        </SmallText>

        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Coach</div>
            <select value={proxyCoachId} onChange={(e) => setProxyCoachId(Number(e.target.value))} style={fieldBase}>
              {coachOptions.length
                ? coachOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                : [1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
                    <option key={id} value={id}>
                      Coach {id}
                    </option>
                  ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Search</div>
            <input
              suppressHydrationWarning
              value={proxySearch}
              onChange={(e) => setProxySearch(e.target.value)}
              placeholder="Search name / club / # / pos…"
              style={fieldBase}
            />
          </div>

          <Button
            onClick={() => {
              setProxyMsg("");
              setProxyErr("");
              loadProxyPlayers(roomId.trim());
            }}
            disabled={anyBusy || !roomId.trim()}
          >
            Refresh players
          </Button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {POS_TABS.map((k) => {
            const active = proxyTab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setProxyTab(k)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: active ? "2px solid #111" : "1px solid #d1d5db",
                  background: active ? "#111" : "#fff",
                  color: active ? "#fff" : "#111",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                {POS_LABEL[k]}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setProxyShowDrafted((v) => !v)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: proxyShowDrafted ? "#fff6d6" : "#fff",
              color: "#111",
              fontWeight: 950,
              cursor: "pointer",
            }}
            title="Show/hide drafted players"
          >
            {proxyShowDrafted ? "Showing drafted too" : "Available only"}
          </button>
        </div>

        {proxyErr ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              border: "1px solid #f2c2c2",
              background: "#fff5f5",
              fontWeight: 900,
            }}
          >
            {proxyErr}
          </div>
        ) : null}

        {proxyMsg ? <div style={{ marginTop: 10, fontWeight: 950 }}>{proxyMsg}</div> : null}

        <div style={{ marginTop: 10 }}>
          <SmallText>
            Sorting:{" "}
            <button type="button" onClick={() => toggleProxySort("average")} style={{ fontWeight: 900 }}>
              Avg
            </button>{" "}
            ·{" "}
            <button type="button" onClick={() => toggleProxySort("player_no")} style={{ fontWeight: 900 }}>
              #
            </button>{" "}
            ·{" "}
            <button type="button" onClick={() => toggleProxySort("player_name")} style={{ fontWeight: 900 }}>
              Name
            </button>{" "}
            ·{" "}
            <button type="button" onClick={() => toggleProxySort("club")} style={{ fontWeight: 900 }}>
              Club
            </button>{" "}
            <span style={{ opacity: 0.75 }}>
              ({proxySortKey} {proxySortDir}) • showing <strong>{proxyFiltered.length}</strong>
            </span>
          </SmallText>
        </div>

        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>#</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Player</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Pos</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Club</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Avg</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {proxyFiltered.slice(0, 120).map((p) => {
                const drafted = p.drafted_by_coach_id != null;
                const disabled = proxyBusy || !draftState || !!draftState?.is_paused || drafted || !roomId.trim();

                return (
                  <tr key={p.player_no} style={{ opacity: disabled ? 0.75 : 1 }}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6", fontWeight: 950 }}>{p.player_no}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6", fontWeight: 900 }}>
                      {p.player_name}
                      {drafted ? (
                        <div style={{ marginTop: 2, fontSize: 12, opacity: 0.75 }}>
                          Drafted by Coach {p.drafted_by_coach_id} ({p.drafted_round}.{p.drafted_pick})
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>{p.pos}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>{p.club}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>{p.average}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f4f6" }}>
                      <Button variant="primary" onClick={() => proxyDraftPlayer(p)} disabled={disabled}>
                        {proxyBusy ? "Drafting..." : `Draft for ${proxyCoachName}`}
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {proxyFiltered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 10, opacity: 0.75 }}>
                    No players match your filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {proxyFiltered.length > 120 ? (
            <div style={{ marginTop: 8 }}>
              <SmallText>
                Showing first <strong>120</strong> results (to keep Admin fast). Narrow with search/tabs.
              </SmallText>
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 10 }}>
          <SmallText>
            Safety rules: proxy draft is blocked if the draft is <strong>paused</strong>. It uses{" "}
            <code>p_override_turn: true</code> so Admin can draft for an absent coach even if it’s not that coach’s pick.
          </SmallText>
        </div>
      </Card>

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
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            {(() => {
              const pairs: Array<[number, number | null]> = [];
              for (let r = block.from; r <= block.to; r += 2) {
                pairs.push([r, r + 1 <= block.to ? r + 1 : null]);
              }

              const cellsByRound = new Map<number, any[]>();
              for (const rr of blockGrid) cellsByRound.set(rr.round, rr.cells);

              const compactSelect: React.CSSProperties = {
                ...fieldBase,
                padding: "6px 8px",
                borderRadius: 10,
                width: 220,
                maxWidth: "100%",
                fontWeight: 900,
                height: 34,
              };

              const rowStyle: React.CSSProperties = {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "6px 0",
                borderBottom: "1px solid #f3f4f6",
              };

              const leftMeta: React.CSSProperties = {
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 160,
                flexWrap: "wrap",
              };

              const pill: React.CSSProperties = {
                fontSize: 12,
                fontWeight: 950,
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#111",
              };

              function RoundColumn({ round }: { round: number }) {
                const cells = cellsByRound.get(round) || [];

                return (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: 12,
                      minWidth: 320,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 950, fontSize: 14 }}>Round {round}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{cells.length} picks</div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      {cells.map((cell) => {
                        const currentName =
                          cell.coachId != null
                            ? coachNameById.get(cell.coachId) ?? `Coach ${cell.coachId}`
                            : "—";
                        const edited = Object.prototype.hasOwnProperty.call(edits, cell.overallPick);

                        return (
                          <div key={cell.overallPick} style={{ ...rowStyle, opacity: editorLocked ? 0.95 : 1 }}>
                            <div style={leftMeta}>
                              <span style={pill}>P{cell.pickInRound}</span>
                              <span style={{ fontSize: 12, opacity: 0.8 }}>#{cell.overallPick}</span>
                              {edited ? <span style={{ ...pill, borderColor: "#111" }}>edited</span> : null}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                              <select
                                disabled={editorLocked}
                                value={cell.coachId ?? ""}
                                onChange={(e) => setCell(cell.overallPick, Number(e.target.value))}
                                style={{
                                  ...compactSelect,
                                  border: edited ? "2px solid #111" : (compactSelect.border as any),
                                  background: editorLocked ? "#f3f4f6" : edited ? "#fff6d6" : "#fff",
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

                              <div style={{ fontSize: 12, opacity: 0.8 }}>
                                Current: <strong>{currentName}</strong>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              return (
                <div style={{ display: "grid", gap: 12 }}>
                  {pairs.map(([a, b]) => (
                    <div
                      key={`${a}-${b ?? "x"}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 12,
                        alignItems: "start",
                      }}
                    >
                      <RoundColumn round={a} />
                      {b ? <RoundColumn round={b} /> : <div />}
                    </div>
                  ))}

                  <SmallText>
                    Tip: change any pick and the whole block is recalculated as a snake. Then hit{" "}
                    <strong>Save block</strong> to write it to <code>draft_order</code>. Use{" "}
                    <strong>Reset block</strong> to revert unsaved edits.
                  </SmallText>
                </div>
              );
            })()}
          </div>
        )}
      </Card>

      <Card
        title="Live Draft Board"
        right={
          <SmallText>
            room: <strong>{ROOM_DISPLAY_NAME}</strong>
            {anyBusy ? <span style={{ marginLeft: 8, opacity: 0.8 }}>• updating…</span> : null}
          </SmallText>
        }
      >
        <DraftClient key={`${roomId.trim()}-${refreshKey}`} />
      </Card>

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
        {showDebug ? (
          <div style={{ display: "grid", gap: 12 }}>
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

            <div style={{ paddingTop: 4 }}>
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
                  <SmallText>This is mainly for troubleshooting or running multiple rooms.</SmallText>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <SmallText>Debug tools hidden. Click “Show debug” to reveal.</SmallText>
        )}
      </Card>
    </Page>
  );
}