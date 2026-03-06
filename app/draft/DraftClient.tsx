"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return { r: 255, g: 255, b: 255 };
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function luminanceFromHex(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function bestTextColor(bgHex: string) {
  const L = luminanceFromHex(bgHex);
  return L > 0.5 ? "#111111" : "#ffffff";
}

function pauseReasonLabel(pause_reason: string | null) {
  if (!pause_reason) return null;
  if (pause_reason.startsWith("WAIT_BLOCK_")) {
    const block = pause_reason.replace("WAIT_BLOCK_", "");
    return `Waiting for Admin to set draft order for rounds ${block}…`;
  }
  return "Paused";
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

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

function countByTag(list: Player[]) {
  const counts: Record<string, number> = {};
  for (const p of list) {
    for (const t of splitPos(p.pos)) counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

function formatSbError(err: any): string {
  if (!err) return "";
  const safe = {
    message: err?.message,
    details: err?.details,
    hint: err?.hint,
    code: err?.code,
    status: err?.status,
    name: err?.name,
  };
  try {
    return JSON.stringify(safe, null, 2);
  } catch {
    return String(err);
  }
}

type ConfirmState = {
  open: boolean;
  player: Player | null;
};

type DraftClientProps = {
  mode?: "admin" | "coach";
};

export default function DraftClient({ mode = "coach" }: DraftClientProps) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin") ?? false;
  const isAdmin = mode === "admin" || isAdminRoute;

  const sp = useSearchParams();
  const room = (sp.get("room") || "DUMMY1").trim().toUpperCase();
  const coachId = Number(sp.get("coach") || "0");

  const [state, setState] = useState<DraftState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [draftOrder, setDraftOrder] = useState<DraftOrderRow[]>([]);

  const [stateError, setStateError] = useState<string | null>(null);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [coachesError, setCoachesError] = useState<string | null>(null);
  const [draftOrderError, setDraftOrderError] = useState<string | null>(null);

  const [posTab, setPosTab] = useState<PosTab>("ALL");
  const [sortKey, setSortKey] = useState<"player_no" | "player_name" | "club" | "average">("player_no");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [hideDrafted, setHideDrafted] = useState(true);

  const [confirm, setConfirm] = useState<ConfirmState>({ open: false, player: null });
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);

  const skipKey = useMemo(() => `super8_skip_confirm:${room}:${coachId}`, [room, coachId]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(skipKey);
      setSkipConfirm(v === "1");
    } catch {
      setSkipConfirm(false);
    }
  }, [skipKey]);

  const timersRef = useRef<Record<string, any>>({});

  function schedule(key: "state" | "players" | "coaches" | "order", fn: () => void, ms = 150) {
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(fn, ms);
  }

  async function fetchLatestState() {
    const { data, error } = await supabase
      .from("draft_state")
      .select("room_id,is_paused,pause_reason,rounds_total,current_round,current_pick_in_round,current_coach_id")
      .eq("room_id", room)
      .maybeSingle();

    if (error) {
      console.error("draft fetchLatestState error:", error);
      return null;
    }

    return (data as DraftState) || null;
  }

  async function loadState() {
    setStateError(null);

    const data = await fetchLatestState();

    if (!data) {
      setState(null);
      return;
    }

    setState(data);
  }

  async function loadPlayers() {
    setPlayersError(null);

    const { data, error } = await supabase
      .from("players")
      .select("player_no,pos,club,player_name,average,drafted_by_coach_id,drafted_round,drafted_pick")
      .eq("room_id", room);

    if (error) {
      console.error("draft loadPlayers error:", error);
      setPlayersError(formatSbError(error));
      setPlayers([]);
    } else {
      setPlayers((data as Player[]) || []);
    }
  }

  async function loadCoaches() {
    setCoachesError(null);

    const { data, error } = await supabase
      .from("coaches")
      .select("room_id,coach_id,coach_name,session_id")
      .eq("room_id", room)
      .order("coach_id", { ascending: true });

    if (error) {
      console.error("draft loadCoaches error:", error);
      setCoachesError(formatSbError(error));
      setCoaches([]);
    } else {
      setCoaches((data as Coach[]) || []);
    }
  }

  async function loadDraftOrder() {
    setDraftOrderError(null);

    const { data, error } = await supabase
      .from("draft_order")
      .select("room_id,overall_pick,coach_id")
      .eq("room_id", room)
      .order("overall_pick", { ascending: true });

    if (error) {
      console.error("draft loadDraftOrder error:", error);
      setDraftOrderError(formatSbError(error));
      setDraftOrder([]);
    } else {
      setDraftOrder((data as DraftOrderRow[]) || []);
    }
  }

  async function initialLoad() {
    await Promise.all([loadState(), loadPlayers(), loadCoaches(), loadDraftOrder()]);
  }

  useEffect(() => {
    for (const k of Object.keys(timersRef.current)) clearTimeout(timersRef.current[k]);
    timersRef.current = {};

    void initialLoad();

    const ch = supabase.channel(`draft_room_${room}`);

    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "draft_state", filter: `room_id=eq.${room}` },
      () => schedule("state", loadState, 120)
    );

    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room}` },
      () => schedule("players", loadPlayers, 250)
    );

    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "coaches", filter: `room_id=eq.${room}` },
      () => schedule("coaches", loadCoaches, 200)
    );

    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "draft_order", filter: `room_id=eq.${room}` },
      () => schedule("order", loadDraftOrder, 200)
    );

    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
      for (const k of Object.keys(timersRef.current)) clearTimeout(timersRef.current[k]);
      timersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const inferredCoachIds = useMemo(() => {
    const s = new Set<number>();
    for (const row of draftOrder) s.add(row.coach_id);
    return Array.from(s).sort((a, b) => a - b);
  }, [draftOrder]);

  const coachColumns = useMemo(() => {
    if (coaches.length > 0) {
      return [...coaches].sort((a, b) => a.coach_id - b.coach_id).map((c) => ({
        coach_id: c.coach_id,
        coach_name: c.coach_name,
      }));
    }
    return inferredCoachIds.map((id) => ({
      coach_id: id,
      coach_name: `Coach ${id}`,
    }));
  }, [coaches, inferredCoachIds]);

  const coachNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of coachColumns) m.set(c.coach_id, c.coach_name);
    return m;
  }, [coachColumns]);

  const nCoaches = coachColumns.length || 0;

  function overallPick(round: number, pickInRound: number) {
    if (!nCoaches) return 0;
    return (round - 1) * nCoaches + pickInRound;
  }

  const roundsTotal = useMemo(() => {
    if (state?.rounds_total) return state.rounds_total;
    if (!draftOrder.length || !nCoaches) return 0;
    const maxPick = draftOrder[draftOrder.length - 1]?.overall_pick ?? 0;
    return Math.ceil(maxPick / nCoaches);
  }, [state, draftOrder, nCoaches]);

  const draftOrderByPick = useMemo(() => {
    const m = new Map<number, number>();
    for (const row of draftOrder) m.set(row.overall_pick, row.coach_id);
    return m;
  }, [draftOrder]);

  const draftedByOverall = useMemo(() => {
    const m = new Map<number, Player>();
    if (!nCoaches) return m;
    for (const p of players) {
      if (p.drafted_round && p.drafted_pick) {
        const ov = overallPick(p.drafted_round, p.drafted_pick);
        if (ov > 0) m.set(ov, p);
      }
    }
    return m;
  }, [players, nCoaches]);

  const isMyTurn = !!state && !state.is_paused && state.current_coach_id === coachId;

  const topBar = useMemo(() => {
    if (!state) return `Room ${room} • Draft not started yet`;
    const live = state.is_paused ? "PAUSED" : "LIVE";
    return `Room ${room} • Round ${state.current_round}/${state.rounds_total} • Pick ${state.current_pick_in_round} • ${live}`;
  }, [state, room]);

  const tabIdx = useMemo(() => POS_TABS.indexOf(posTab), [posTab]);

  function prevTab() {
    const i = tabIdx <= 0 ? POS_TABS.length - 1 : tabIdx - 1;
    setPosTab(POS_TABS[i]);
  }

  function nextTab() {
    const i = tabIdx >= POS_TABS.length - 1 ? 0 : tabIdx + 1;
    setPosTab(POS_TABS[i]);
  }

  const baseList = useMemo(() => {
    return hideDrafted ? players.filter((p) => p.drafted_by_coach_id == null) : players;
  }, [players, hideDrafted]);

  const filtered = useMemo(() => {
    let list = baseList;
    list = list.filter((p) => matchesTab(p, posTab));

    const q = norm(search);
    if (q) {
      list = list.filter((p) => {
        const hay = [String(p.player_no), p.player_name, p.club, p.pos, String(p.average ?? "")]
          .map(norm)
          .join(" | ");
        return hay.includes(q);
      });
    }

    list = list.slice().sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "player_no") return (a.player_no - b.player_no) * dir;
      if (sortKey === "average") return (a.average - b.average) * dir;
      if (sortKey === "club") return a.club.localeCompare(b.club) * dir;
      return a.player_name.localeCompare(b.player_name) * dir;
    });

    return list;
  }, [baseList, posTab, search, sortKey, sortDir]);

  const myPicks = useMemo(() => {
    return players
      .filter((p) => p.drafted_by_coach_id === coachId && p.drafted_round && p.drafted_pick)
      .slice()
      .sort((a, b) => (a.drafted_round! - b.drafted_round!) || (a.drafted_pick! - b.drafted_pick!));
  }, [players, coachId]);

  const myDraftSheet = useMemo(() => {
    const rt = state?.rounds_total ?? 46;
    const slots = Array.from({ length: rt }, (_, i) => i + 1);
    return slots.map((slotNo) => {
      const assigned = myPicks[slotNo - 1] || null;
      return { slotNo, displayPosition: assigned ? assigned.pos : "", assigned };
    });
  }, [myPicks, state]);

  const analytics = useMemo(() => {
    const total = players.length;
    const available = players.filter((p) => p.drafted_by_coach_id == null);
    const drafted = total - available.length;
    return {
      total,
      available: available.length,
      drafted,
      myPicks: myPicks.length,
      posCountsAll: countByTag(players),
      posCountsAvail: countByTag(available),
    };
  }, [players, myPicks]);

  const toggleSort = (key: typeof sortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const miniBoard = useMemo(() => {
    if (!nCoaches || !roundsTotal) return null;

    const curRound = state?.current_round ?? 1;
    const r1 = curRound;
    const r2 = Math.min(curRound + 1, roundsTotal);

    const roundsToShow = r1 === r2 ? [r1] : [r1, r2];

    const rows = roundsToShow.map((round) => {
      const direction = round % 2 === 1 ? "→" : "←";

      const cells = Array.from({ length: nCoaches }, (_, j) => {
        const pickInRound = j + 1;
        const ov = overallPick(round, pickInRound);

        const cid = draftOrderByPick.get(ov) ?? null;
        const cname = cid != null ? (coachNameById.get(cid) ?? `Coach ${cid}`) : "—";

        const drafted = draftedByOverall.get(ov) ?? null;

        const isCurrent =
          !!state &&
          !state.is_paused &&
          state.current_round === round &&
          state.current_pick_in_round === pickInRound;

        return { round, pickInRound, overall: ov, coach_name: cname, drafted, isCurrent };
      });

      return { round, direction, cells };
    });

    return { rows };
  }, [nCoaches, roundsTotal, state, draftOrderByPick, coachNameById, draftedByOverall]);

  async function doDraft(p: Player) {
    if (busy) return;

    const freshState = await fetchLatestState();

    if (!freshState) {
      alert("Draft not started yet (no draft_state row).");
      return;
    }

    setState(freshState);

    if (freshState.is_paused) {
      alert(pauseReasonLabel(freshState.pause_reason) ?? "Draft is paused.");
      return;
    }

    if (freshState.current_coach_id !== coachId) {
      const liveCoachName = coachNameById.get(freshState.current_coach_id) ?? `Coach ${freshState.current_coach_id}`;
      alert(`Not your turn. It is currently ${liveCoachName}'s pick.`);
      return;
    }

    if (p.drafted_by_coach_id != null) {
      alert("That player has already been drafted.");
      return;
    }

    setBusy(true);

    const { data, error } = await supabase.rpc("draft_pick", {
      p_room_id: room,
      p_player_no: p.player_no,
      p_coach_id: coachId,
      p_override_turn: false,
    });

    if (error) {
      console.error("draft draft_pick RPC error:", error);
      alert("Draft failed: " + (error?.message ?? "Unknown error"));
      setBusy(false);
      await loadState();
      await loadPlayers();
      return;
    }

    const res = Array.isArray(data) ? data[0] : data;
    if (!res?.ok) {
      const freshAfter = await fetchLatestState();
      if (freshAfter) setState(freshAfter);

      if (freshAfter && freshAfter.current_coach_id !== coachId) {
        const liveCoachName = coachNameById.get(freshAfter.current_coach_id) ?? `Coach ${freshAfter.current_coach_id}`;
        alert(`Draft failed: it is now ${liveCoachName}'s pick.`);
      } else {
        alert("Draft failed: " + (res?.message ?? "Unknown error"));
      }

      setBusy(false);
      await loadPlayers();
      return;
    }

    setBusy(false);
  }

  function requestDraft(p: Player) {
    if (p.drafted_by_coach_id != null) return;

    if (!state) {
      alert("Draft not started yet (no draft_state row).");
      return;
    }
    if (state.is_paused) {
      alert(pauseReasonLabel(state.pause_reason) ?? "Draft is paused.");
      return;
    }
    if (!isMyTurn) {
      const liveCoachName = state.current_coach_id
        ? coachNameById.get(state.current_coach_id) ?? `Coach ${state.current_coach_id}`
        : "another coach";
      alert(`Not your turn. It is currently ${liveCoachName}'s pick.`);
      return;
    }
    if (busy) return;

    if (skipConfirm) {
      void doDraft(p);
      return;
    }

    setDontAskAgain(false);
    setConfirm({ open: true, player: p });
  }

  function closeConfirm() {
    setConfirm({ open: false, player: null });
    setDontAskAgain(false);
  }

  async function confirmDraftNow() {
    const p = confirm.player;
    if (!p) return;

    if (dontAskAgain) {
      try {
        localStorage.setItem(skipKey, "1");
        setSkipConfirm(true);
      } catch {
        // ignore
      }
    }

    closeConfirm();
    await doDraft(p);
  }

  const availablePanelBg = "#1f2937";
  const availableText = bestTextColor(availablePanelBg);

  const pageBg = "#eef2f7";
  const panelBorder = "#d0d5dd";
  const textMain = "#101828";
  const textSoft = "#475467";

  const chipStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    border: "1px solid #e4e7ec",
    borderRadius: 12,
    background: "#f8fafc",
    fontWeight: 800,
    fontSize: 13,
    color: textMain,
  };

  const card: React.CSSProperties = {
    border: `1px solid ${panelBorder}`,
    borderRadius: 16,
    padding: 14,
    background: "#ffffff",
    boxShadow: "0 10px 30px rgba(16,24,40,0.06)",
  };

  const subtle: React.CSSProperties = { fontSize: 12, color: textSoft };

  const anyError = stateError || playersError || coachesError || draftOrderError;

  const coachName = coachId ? coachNameById.get(coachId) ?? `Coach ${coachId}` : "No coach selected";

  return (
    <div style={{ minHeight: "100vh", background: pageBg, padding: 16 }}>
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong style={{ color: textMain, fontSize: 18 }}>{topBar}</strong>

              <div
                style={{
                  marginTop: 8,
                  color: state?.is_paused ? "#b54708" : isMyTurn ? "#027a48" : textSoft,
                  fontWeight: 900,
                  fontSize: 15,
                }}
              >
                {state?.is_paused
                  ? pauseReasonLabel(state.pause_reason) ?? "Waiting (Admin hasn’t started the draft yet)…"
                  : isMyTurn
                  ? "You are ON THE CLOCK"
                  : "Waiting for your turn…"}
              </div>

              <div style={{ marginTop: 8, fontSize: 13, color: textSoft }}>
                Room: <strong style={{ color: textMain }}>{room}</strong> • Coach:{" "}
                <strong style={{ color: textMain }}>{coachName}</strong>
                {isAdmin ? <span style={{ marginLeft: 8 }}>• Admin view</span> : null}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <a
                href={`/board?room=${encodeURIComponent(room)}`}
                style={{
                  padding: "11px 14px",
                  borderRadius: 12,
                  border: "1px solid #111111",
                  background: "#ffffff",
                  fontWeight: 900,
                  textDecoration: "none",
                  color: "#111111",
                }}
              >
                Open Board
              </a>

              <a
                href={`/admin?room=${encodeURIComponent(room)}`}
                style={{
                  padding: "11px 14px",
                  borderRadius: 12,
                  border: "1px solid #111111",
                  background: "#111111",
                  fontWeight: 900,
                  textDecoration: "none",
                  color: "#ffffff",
                }}
              >
                Admin
              </a>
            </div>
          </div>

          {state && !state.is_paused && isMyTurn ? (
            <div
              style={{
                marginTop: 14,
                padding: "16px 18px",
                borderRadius: 16,
                border: "2px solid #111111",
                background: "linear-gradient(90deg, #ffe08a, #fff6d6)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: 0.3, color: "#111111" }}>
                ⏱️ ON THE CLOCK
              </div>
              <div style={{ fontWeight: 900, color: "#111111" }}>
                Pick:{" "}
                <span style={{ fontFamily: "monospace" }}>
                  {state.current_round}.{state.current_pick_in_round}
                </span>
              </div>
            </div>
          ) : null}

          {anyError ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                border: "1px solid #fecdca",
                background: "#fef3f2",
                color: "#b42318",
                fontWeight: 800,
                fontSize: 13,
                whiteSpace: "pre-wrap",
              }}
            >
              There are loading errors. Check the browser console for the exact details.
            </div>
          ) : null}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 1000, color: textMain, fontSize: 18 }}>Mini Draft Board</div>
              <div style={subtle}>
                Showing: <strong style={{ color: textMain }}>current</strong> +{" "}
                <strong style={{ color: textMain }}>next</strong> round
              </div>
            </div>

            {!miniBoard ? (
              <div style={{ marginTop: 10, color: textSoft }}>
                Waiting for draft data… (need coaches + draft_order + rounds_total)
              </div>
            ) : (
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e4e7ec", color: textMain }}>
                        Round
                      </th>
                      {Array.from({ length: nCoaches || 0 }, (_, i) => (
                        <th
                          key={i}
                          style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e4e7ec", color: textMain }}
                        >
                          Pick {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {miniBoard.rows.map((r) => (
                      <tr key={r.round}>
                        <td
                          style={{
                            padding: 10,
                            borderBottom: "1px solid #f2f4f7",
                            fontWeight: 1000,
                            color: textMain,
                          }}
                        >
                          {r.round} <span style={{ color: textSoft }}>{r.direction}</span>
                        </td>

                        {r.cells.map((c) => (
                          <td
                            key={c.overall}
                            style={{
                              padding: 10,
                              borderBottom: "1px solid #f2f4f7",
                              background: c.isCurrent ? "#fff6d6" : undefined,
                              outline: c.isCurrent ? "2px solid #d3a200" : "1px solid transparent",
                              verticalAlign: "top",
                              minWidth: 170,
                              color: textMain,
                            }}
                            title={`Overall #${c.overall} • ${c.coach_name}`}
                          >
                            <div style={{ fontWeight: 1000 }}>{c.coach_name}</div>
                            <div style={{ fontSize: 12, color: textSoft }}>Overall #{c.overall}</div>

                            {c.drafted ? (
                              <div style={{ marginTop: 5, fontSize: 12 }}>
                                <strong>{c.drafted.player_name}</strong>
                                <div style={{ color: textSoft }}>
                                  #{c.drafted.player_no} • {c.drafted.pos} • {c.drafted.club}
                                </div>
                              </div>
                            ) : (
                              <div style={{ marginTop: 5, fontSize: 12, color: "#98a2b3" }}>—</div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {isAdmin ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={card}>
              <h2 style={{ marginTop: 0, color: textMain }}>Analytics</h2>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={chipStyle}>
                  <span>Total</span>
                  <span>{analytics.total}</span>
                </div>
                <div style={chipStyle}>
                  <span>Available</span>
                  <span>{analytics.available}</span>
                </div>
                <div style={chipStyle}>
                  <span>Drafted</span>
                  <span>{analytics.drafted}</span>
                </div>
                <div style={chipStyle}>
                  <span>My Picks</span>
                  <span>{analytics.myPicks}</span>
                </div>
              </div>

              <div style={{ marginTop: 12, fontWeight: 1000, fontSize: 13, color: textSoft }}>
                Position counts (Available / Total)
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                {(["KD", "DEF", "MID", "FOR", "KF", "RUC"] as const).map((tag) => (
                  <div key={tag} style={chipStyle}>
                    <span>{tag}</span>
                    <span>
                      {analytics.posCountsAvail[tag] ?? 0} / {analytics.posCountsAll[tag] ?? 0}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: textSoft }}>
                Note: counts use your actual <code>pos</code> tags (supports dual like MID/FOR).
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)", gap: 12 }}>
            <div
              style={{
                border: `1px solid ${panelBorder}`,
                padding: 14,
                background: availablePanelBg,
                color: availableText,
                borderRadius: 16,
                boxShadow: "0 10px 30px rgba(16,24,40,0.08)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ marginTop: 0, marginBottom: 0, color: availableText, fontSize: 22 }}>Players</h2>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={prevTab}
                    style={{
                      padding: "9px 13px",
                      borderRadius: 10,
                      border: "1px solid #475467",
                      background: "#111827",
                      color: availableText,
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                    title="Previous position tab"
                  >
                    ←
                  </button>

                  <button
                    type="button"
                    onClick={nextTab}
                    style={{
                      padding: "9px 13px",
                      borderRadius: 10,
                      border: "1px solid #475467",
                      background: "#111827",
                      color: availableText,
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                    title="Next position tab"
                  >
                    →
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, marginBottom: 12 }}>
                {POS_TABS.map((k) => {
                  const active = posTab === k;
                  const bg = active ? "#f9fafb" : "#111827";
                  const fg = active ? "#101828" : "#ffffff";

                  return (
                    <button
                      key={k}
                      style={{
                        padding: "9px 15px",
                        border: active ? "1px solid #f9fafb" : "1px solid #475467",
                        borderRadius: 10,
                        cursor: "pointer",
                        fontWeight: 900,
                        background: bg,
                        color: fg,
                        boxShadow: active ? "0 0 0 2px rgba(255,255,255,0.18)" : "none",
                      }}
                      onClick={() => setPosTab(k)}
                      type="button"
                    >
                      {POS_LABEL[k]}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name / club / # / pos…"
                  style={{
                    flex: 1,
                    minWidth: 220,
                    padding: "11px 13px",
                    borderRadius: 12,
                    border: "1px solid #475467",
                    background: "#111827",
                    color: availableText,
                    outline: "none",
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                />

                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{
                    padding: "11px 13px",
                    borderRadius: 12,
                    border: "1px solid #475467",
                    background: "#111827",
                    color: availableText,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={() => setHideDrafted((v) => !v)}
                  style={{
                    padding: "11px 13px",
                    borderRadius: 12,
                    border: "1px solid #475467",
                    background: hideDrafted ? "#f9fafb" : "#111827",
                    color: hideDrafted ? "#101828" : availableText,
                    fontWeight: 1000,
                    cursor: "pointer",
                  }}
                  title="Toggle drafted players visibility"
                >
                  {hideDrafted ? "Available only" : "Show drafted"}
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  fontSize: 12,
                  marginBottom: 10,
                  color: "#e5e7eb",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ opacity: 0.9 }}>Sort:</span>

                {[
                  ["player_no", "ID"],
                  ["player_name", "Name"],
                  ["club", "Club"],
                  ["average", "Average"],
                ].map(([key, label]) => {
                  const active = sortKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSort(key as typeof sortKey)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: active ? "1px solid #ffffff" : "1px solid #475467",
                        background: active ? "#f9fafb" : "#111827",
                        color: active ? "#101828" : "#ffffff",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}

                <span style={{ opacity: 0.85 }}>
                  ({sortKey} {sortDir}) • showing <strong>{filtered.length}</strong>
                </span>
              </div>

              <div style={{ maxHeight: 560, overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.14)" }}>
                {filtered.map((p) => {
                  const disabled = !isMyTurn || busy || p.drafted_by_coach_id != null || !!state?.is_paused;

                  return (
                    <div
                      key={p.player_no}
                      onClick={() => {
                        if (!disabled) requestDraft(p);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (!disabled) requestDraft(p);
                        }
                      }}
                      style={{
                        padding: 12,
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.78 : 1,
                        userSelect: "none",
                      }}
                      title={disabled ? "Draft disabled (not your turn / paused / busy / already drafted)" : "Click to draft"}
                    >
                      <div style={{ color: availableText }}>
                        <div style={{ fontSize: 15 }}>
                          <strong style={{ color: availableText }}>{p.player_no}</strong> — {p.player_name}
                        </div>
                        <div style={{ fontSize: 13, color: "#d0d5dd", marginTop: 2 }}>
                          {p.club} • {p.pos} • Avg {p.average}
                        </div>
                      </div>

                      <button
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!disabled) requestDraft(p);
                        }}
                        style={{
                          padding: "9px 13px",
                          borderRadius: 10,
                          border: "1px solid #d0d5dd",
                          cursor: disabled ? "not-allowed" : "pointer",
                          background: disabled ? "#98a2b3" : "#ffffff",
                          color: disabled ? "#344054" : "#111111",
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                        }}
                        type="button"
                      >
                        Draft
                      </button>
                    </div>
                  );
                })}

                {filtered.length === 0 ? (
                  <div style={{ padding: 12, color: "#d0d5dd" }}>
                    No players found for {POS_LABEL[posTab]}
                    {search ? ` with “${search}”` : ""}.
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={card}>
                <h2 style={{ marginTop: 0, color: textMain }}>Analytics</h2>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={chipStyle}>
                    <span>Total</span>
                    <span>{analytics.total}</span>
                  </div>
                  <div style={chipStyle}>
                    <span>Available</span>
                    <span>{analytics.available}</span>
                  </div>
                  <div style={chipStyle}>
                    <span>Drafted</span>
                    <span>{analytics.drafted}</span>
                  </div>
                  <div style={chipStyle}>
                    <span>My Picks</span>
                    <span>{analytics.myPicks}</span>
                  </div>
                </div>

                <div style={{ marginTop: 12, fontWeight: 1000, fontSize: 13, color: textSoft }}>
                  Position counts (Available / Total)
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  {(["KD", "DEF", "MID", "FOR", "KF", "RUC"] as const).map((tag) => (
                    <div key={tag} style={chipStyle}>
                      <span>{tag}</span>
                      <span>
                        {analytics.posCountsAvail[tag] ?? 0} / {analytics.posCountsAll[tag] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: textSoft }}>
                  Note: counts use your actual <code>pos</code> tags (supports dual like MID/FOR).
                </div>
              </div>

              <div style={card}>
                <h2 style={{ marginTop: 0, color: textMain }}>My Draft Sheet</h2>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #e4e7ec", padding: 8, color: textMain }}>
                          Slot #
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #e4e7ec", padding: 8, color: textMain }}>
                          Position
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #e4e7ec", padding: 8, color: textMain }}>
                          Player #
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #e4e7ec", padding: 8, color: textMain }}>
                          Player
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #e4e7ec", padding: 8, color: textMain }}>
                          Club
                        </th>
                        <th style={{ textAlign: "left", borderBottom: "1px solid #e4e7ec", padding: 8, color: textMain }}>
                          Pick #
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {myDraftSheet.map((s) => (
                        <tr key={s.slotNo}>
                          <td style={{ borderBottom: "1px solid #f2f4f7", padding: 8, color: textMain }}>{s.slotNo}</td>
                          <td style={{ borderBottom: "1px solid #f2f4f7", padding: 8, color: textMain }}>
                            {s.displayPosition}
                          </td>
                          <td style={{ borderBottom: "1px solid #f2f4f7", padding: 8, color: textMain }}>
                            {s.assigned ? s.assigned.player_no : ""}
                          </td>
                          <td style={{ borderBottom: "1px solid #f2f4f7", padding: 8, color: textMain }}>
                            {s.assigned ? s.assigned.player_name : ""}
                          </td>
                          <td style={{ borderBottom: "1px solid #f2f4f7", padding: 8, color: textMain }}>
                            {s.assigned ? s.assigned.club : ""}
                          </td>
                          <td style={{ borderBottom: "1px solid #f2f4f7", padding: 8, color: textMain }}>
                            {s.assigned && s.assigned.drafted_round && s.assigned.drafted_pick
                              ? `${s.assigned.drafted_round}.${s.assigned.drafted_pick}`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: textSoft }}>
                  Slots shown = {state?.rounds_total ?? 46}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isAdmin && confirm.open && confirm.player ? (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.60)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              zIndex: 1000,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeConfirm();
            }}
          >
            <div
              style={{
                width: "min(560px, 100%)",
                borderRadius: 18,
                background: "#ffffff",
                border: "1px solid #e4e7ec",
                boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
                padding: 18,
              }}
            >
              <div style={{ fontWeight: 1000, fontSize: 22, color: textMain }}>Confirm Draft Pick</div>

              <div style={{ marginTop: 6, fontSize: 14, color: textSoft, lineHeight: 1.5 }}>
                You are about to draft the following player for <strong style={{ color: textMain }}>{coachName}</strong>.
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 14,
                  background: "#f8fafc",
                  border: "1px solid #e4e7ec",
                }}
              >
                <div style={{ fontWeight: 1000, fontSize: 18, color: textMain }}>
                  #{confirm.player.player_no} — {confirm.player.player_name}
                </div>
                <div style={{ marginTop: 6, fontSize: 14, color: textSoft }}>
                  {confirm.player.club} • {confirm.player.pos} • Avg {confirm.player.average}
                </div>
              </div>

              <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
                <input type="checkbox" checked={dontAskAgain} onChange={(e) => setDontAskAgain(e.target.checked)} />
                <span style={{ fontWeight: 900, color: textMain }}>Don’t ask again on this device</span>
              </label>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => closeConfirm()}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: "1px solid #344054",
                    background: "#ffffff",
                    color: "#101828",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Cancel Draft
                </button>

                <button
                  type="button"
                  onClick={() => void confirmDraftNow()}
                  disabled={busy}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: "1px solid #111111",
                    background: busy ? "#98a2b3" : "#111111",
                    color: "#ffffff",
                    fontWeight: 1000,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  {busy ? "Drafting..." : "Confirm Draft Pick"}
                </button>
              </div>

              <div style={{ marginTop: 12, fontSize: 12, color: textSoft }}>
                Tip: this confirmation helps prevent accidental draft clicks.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}