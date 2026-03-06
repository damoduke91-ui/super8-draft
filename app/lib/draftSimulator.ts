import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export type DraftStateRow = {
  room_id: string;
  is_paused: boolean;
  pause_reason: string | null;
  rounds_total: number;
  current_round: number;
  current_pick_in_round: number;
  current_coach_id: number;
};

export type DraftOrderRow = {
  room_id: string;
  overall_pick: number;
  coach_id: number;
};

export type DraftPickRow = {
  room_id: string;
  overall_pick: number;
  round: number;
  pick_in_round: number;
  coach_id: number;
  player_no: number;
  created_at?: string;
};

export type PlayerRow = {
  room_id: string;
  player_no: number;
  pos: string;
  club: string;
  player_name: string;
  average: number | null;
  drafted_by_coach_id: number | null;
  drafted_round: number | null;
  drafted_pick: number | null;
};

export type SimulateDraftParams = {
  roomId: string;
  rounds?: number;
  manualCoachIds?: number[];
  resetDraft?: boolean;
};

export type SimulateDraftResult = {
  ok: boolean;
  roomId: string;
  rounds: number;
  coachIds: number[];
  totalPicks: number;
  existingPicks: number;
  picksDone: number;
  status: "complete" | "waiting_for_manual_pick";
  stoppedAtOverallPick: number | null;
  stoppedForCoachId: number | null;
  message: string;
};

const BASE_REQUIREMENTS = {
  KD: 4,
  DEF: 7,
  MID: 8,
  FOR: 7,
  KF: 4,
  RUC: 3,
} as const;

const EXTRA_REQUIREMENTS = {
  KD: 1,
  DEF: 1,
  MID: 1,
  FOR: 1,
  KF: 1,
  RUC: 1,
} as const;

const GROUPS = ["KD", "DEF", "MID", "FOR", "KF", "RUC"] as const;
type Group = (typeof GROUPS)[number];

type CoachPlan = {
  counts: Record<Group, number>;
};

function splitPos(posRaw: string): string[] {
  return (posRaw || "")
    .split("/")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function matchesGroup(posRaw: string, group: Group): boolean {
  const tags = splitPos(posRaw);

  if (group === "DEF") return tags.includes("DEF") && !tags.includes("KD");
  if (group === "FOR") return tags.includes("FOR") && !tags.includes("KF");
  if (group === "KD") return tags.includes("KD");
  if (group === "KF") return tags.includes("KF");

  return tags.includes(group);
}

function eligibleGroups(player: Pick<PlayerRow, "pos">): Group[] {
  return GROUPS.filter((g) => matchesGroup(player.pos, g));
}

function emptyCoachPlan(): CoachPlan {
  return {
    counts: {
      KD: 0,
      DEF: 0,
      MID: 0,
      FOR: 0,
      KF: 0,
      RUC: 0,
    },
  };
}

function baseDeficit(plan: CoachPlan, group: Group): number {
  return Math.max(0, BASE_REQUIREMENTS[group] - plan.counts[group]);
}

function extraDeficit(plan: CoachPlan, group: Group): number {
  const needForExtra = BASE_REQUIREMENTS[group] + EXTRA_REQUIREMENTS[group];
  return Math.max(0, needForExtra - plan.counts[group]);
}

function chooseGroupForPlayer(player: Pick<PlayerRow, "pos">, plan: CoachPlan): Group | null {
  const groups = eligibleGroups(player);
  if (!groups.length) return null;

  const baseCandidates = groups
    .map((group) => ({ group, deficit: baseDeficit(plan, group) }))
    .filter((x) => x.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit);

  if (baseCandidates.length) return baseCandidates[0].group;

  const extraCandidates = groups
    .map((group) => ({ group, deficit: extraDeficit(plan, group) }))
    .filter((x) => x.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit);

  if (extraCandidates.length) return extraCandidates[0].group;

  return groups
    .slice()
    .sort((a, b) => {
      const diff = plan.counts[a] - plan.counts[b];
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    })[0];
}

function applyPlayerToPlan(player: Pick<PlayerRow, "pos">, plan: CoachPlan) {
  const group = chooseGroupForPlayer(player, plan);
  if (group) plan.counts[group] += 1;
}

function playerAverage(player: Pick<PlayerRow, "average">): number {
  return Number(player.average ?? 0);
}

function chooseBestPlayerForCoach(pool: PlayerRow[], plan: CoachPlan): PlayerRow | null {
  if (!pool.length) return null;

  let best: PlayerRow | null = null;
  let bestScore = -Infinity;

  for (const player of pool) {
    const groups = eligibleGroups(player);
    const avg = playerAverage(player);

    let score = avg;

    if (groups.length) {
      const bestBaseNeed = Math.max(...groups.map((g) => baseDeficit(plan, g)), 0);
      const bestExtraNeed = Math.max(...groups.map((g) => extraDeficit(plan, g)), 0);

      if (bestBaseNeed > 0) {
        score += 100000 + bestBaseNeed * 1000;
      } else if (bestExtraNeed > 0) {
        score += 10000 + bestExtraNeed * 500;
      }
    }

    if (
      best == null ||
      score > bestScore ||
      (score === bestScore && avg > playerAverage(best)) ||
      (score === bestScore && avg === playerAverage(best) && player.player_no < best.player_no)
    ) {
      best = player;
      bestScore = score;
    }
  }

  return best;
}

function overallToRoundPick(overallPick: number, coachCount: number) {
  const round = Math.floor((overallPick - 1) / coachCount) + 1;
  const pickInRound = ((overallPick - 1) % coachCount) + 1;
  return { round, pickInRound };
}

function uniqueSortedCoachIds(orderRows: DraftOrderRow[]): number[] {
  return Array.from(new Set(orderRows.map((r) => r.coach_id))).sort((a, b) => a - b);
}

function nextCoachIdFromOrder(orderRows: DraftOrderRow[], overallPick: number): number | null {
  const found = orderRows.find((r) => r.overall_pick === overallPick);
  return found?.coach_id ?? null;
}

function compressRoundNumbersToRanges(rounds: number[]): string[] {
  if (!rounds.length) return [];

  const uniqueSorted = Array.from(new Set(rounds)).sort((a, b) => a - b);
  const ranges: string[] = [];

  let start = uniqueSorted[0];
  let prev = uniqueSorted[0];

  for (let i = 1; i < uniqueSorted.length; i++) {
    const current = uniqueSorted[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }

    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = current;
    prev = current;
  }

  ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
  return ranges;
}

function findMissingRoundRanges(orderRows: DraftOrderRow[], rounds: number, coachCount: number): string[] {
  const expectedOverallPicks = Array.from({ length: rounds * coachCount }, (_, i) => i + 1);
  const existingOverallPickSet = new Set(
    orderRows
      .filter((r) => r.coach_id != null)
      .map((r) => r.overall_pick)
  );

  const missingRounds = new Set<number>();

  for (const overallPick of expectedOverallPicks) {
    if (!existingOverallPickSet.has(overallPick)) {
      const { round } = overallToRoundPick(overallPick, coachCount);
      missingRounds.add(round);
    }
  }

  return compressRoundNumbersToRanges(Array.from(missingRounds));
}

export async function runDraftSimulation(params: SimulateDraftParams): Promise<SimulateDraftResult> {
  const roomId = params.roomId.trim();
  const manualCoachIds = Array.from(
    new Set((params.manualCoachIds ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0))
  );
  const resetDraft = params.resetDraft !== false;

  if (!roomId) {
    throw new Error("roomId is required");
  }

  const { data: orderRowsRaw, error: orderErr } = await supabaseAdmin
    .from("draft_order")
    .select("room_id,overall_pick,coach_id")
    .eq("room_id", roomId)
    .order("overall_pick", { ascending: true });

  if (orderErr) {
    throw new Error(`draft_order load error: ${orderErr.message}`);
  }

  const orderRows = ((orderRowsRaw ?? []) as DraftOrderRow[]).filter((r) => r.coach_id != null);
  if (!orderRows.length) {
    throw new Error("No draft_order rows found for this room. Generate the snake first.");
  }

  const coachIds = uniqueSortedCoachIds(orderRows);
  const coachCount = coachIds.length;
  if (coachCount !== 8) {
    throw new Error(`Expected 8 coaches from draft_order, found ${coachCount}.`);
  }

  const maxOverallPick = Math.max(...orderRows.map((r) => r.overall_pick));
  const inferredRounds = Math.ceil(maxOverallPick / coachCount);
  const rounds = Number.isFinite(params.rounds) && Number(params.rounds) > 0 ? Number(params.rounds) : inferredRounds;
  const totalPicks = rounds * coachCount;

  const orderRowsForDraft = orderRows.filter((r) => r.overall_pick >= 1 && r.overall_pick <= totalPicks);

  if (orderRowsForDraft.length < totalPicks) {
    const missingRoundRanges = findMissingRoundRanges(orderRowsForDraft, rounds, coachCount);

    if (missingRoundRanges.length) {
      throw new Error(
        `Missing draft order for these round ranges: ${missingRoundRanges.join(
          ", "
        )}. Generate those snake blocks first, then run the simulation again.`
      );
    }

    throw new Error(
      `draft_order only has ${orderRowsForDraft.length} rows for the first ${rounds} rounds. Generate snake order for all required rounds first.`
    );
  }

  if (resetDraft) {
    const { error: deletePicksErr } = await supabaseAdmin.from("draft_picks").delete().eq("room_id", roomId);
    if (deletePicksErr) throw new Error(`draft_picks reset error: ${deletePicksErr.message}`);

    const { error: resetPlayersErr } = await supabaseAdmin
      .from("players")
      .update({
        drafted_by_coach_id: null,
        drafted_round: null,
        drafted_pick: null,
      })
      .eq("room_id", roomId);

    if (resetPlayersErr) throw new Error(`players reset error: ${resetPlayersErr.message}`);

    const firstCoachId = nextCoachIdFromOrder(orderRowsForDraft, 1);
    if (!firstCoachId) throw new Error("Unable to determine first coach from draft_order.");

    const { error: draftStateErr } = await supabaseAdmin.from("draft_state").upsert(
      {
        room_id: roomId,
        is_paused: false,
        pause_reason: null,
        rounds_total: rounds,
        current_round: 1,
        current_pick_in_round: 1,
        current_coach_id: firstCoachId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "room_id" }
    );

    if (draftStateErr) throw new Error(`draft_state reset error: ${draftStateErr.message}`);
  }

  const { data: picksRaw, error: picksErr } = await supabaseAdmin
    .from("draft_picks")
    .select("room_id,overall_pick,round,pick_in_round,coach_id,player_no,created_at")
    .eq("room_id", roomId)
    .order("overall_pick", { ascending: true });

  if (picksErr) {
    throw new Error(`draft_picks load error: ${picksErr.message}`);
  }

  const existingPicks = (picksRaw ?? []) as DraftPickRow[];
  const existingPickCount = existingPicks.length;

  const { data: playersRaw, error: playersErr } = await supabaseAdmin
    .from("players")
    .select("room_id,player_no,pos,club,player_name,average,drafted_by_coach_id,drafted_round,drafted_pick")
    .eq("room_id", roomId);

  if (playersErr) {
    throw new Error(`players load error: ${playersErr.message}`);
  }

  const allPlayers = (playersRaw ?? []) as PlayerRow[];
  if (!allPlayers.length) {
    throw new Error("No players found in this room.");
  }

  const coachPlans = new Map<number, CoachPlan>();
  for (const coachId of coachIds) coachPlans.set(coachId, emptyCoachPlan());

  const playerByNo = new Map<number, PlayerRow>();
  for (const player of allPlayers) playerByNo.set(player.player_no, player);

  for (const pick of existingPicks) {
    const plan = coachPlans.get(pick.coach_id);
    const player = playerByNo.get(pick.player_no);
    if (plan && player) {
      applyPlayerToPlan(player, plan);
    }
  }

  const draftedPlayerNos = new Set<number>(existingPicks.map((p) => p.player_no));

  const pool = allPlayers
    .filter((p) => !draftedPlayerNos.has(p.player_no) && p.drafted_by_coach_id == null)
    .slice()
    .sort((a, b) => {
      const avgDiff = playerAverage(b) - playerAverage(a);
      if (avgDiff !== 0) return avgDiff;
      return a.player_no - b.player_no;
    });

  const nextOverallPick = existingPickCount + 1;
  let picksDone = 0;

  for (let overallPick = nextOverallPick; overallPick <= totalPicks; overallPick++) {
    const coachId = nextCoachIdFromOrder(orderRowsForDraft, overallPick);
    if (!coachId) {
      throw new Error(`Missing coach assignment in draft_order for overall pick ${overallPick}.`);
    }

    if (manualCoachIds.includes(coachId)) {
      return {
        ok: true,
        roomId,
        rounds,
        coachIds,
        totalPicks,
        existingPicks: existingPickCount,
        picksDone,
        status: "waiting_for_manual_pick",
        stoppedAtOverallPick: overallPick,
        stoppedForCoachId: coachId,
        message: `Stopped at manual coach ${coachId} on overall pick ${overallPick}.`,
      };
    }

    const plan = coachPlans.get(coachId);
    if (!plan) throw new Error(`No roster plan found for coach ${coachId}.`);

    const player = chooseBestPlayerForCoach(pool, plan);
    if (!player) {
      throw new Error(`No available player found for coach ${coachId} at overall pick ${overallPick}.`);
    }

    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("draft_pick", {
      p_room_id: roomId,
      p_player_no: player.player_no,
      p_coach_id: coachId,
      p_override_turn: true,
    });

    if (rpcErr) {
      throw new Error(`draft_pick rpc error at overall pick ${overallPick}: ${rpcErr.message}`);
    }

    const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!rpcResult?.ok) {
      throw new Error(
        `draft_pick failed at overall pick ${overallPick}: ${rpcResult?.message ?? "Unknown error"}`
      );
    }

    const idx = pool.findIndex((p) => p.player_no === player.player_no);
    if (idx >= 0) pool.splice(idx, 1);

    applyPlayerToPlan(player, plan);
    picksDone++;
  }

  return {
    ok: true,
    roomId,
    rounds,
    coachIds,
    totalPicks,
    existingPicks: existingPickCount,
    picksDone,
    status: "complete",
    stoppedAtOverallPick: null,
    stoppedForCoachId: null,
    message: "Simulation complete.",
  };
}

export function getRosterTargets() {
  return {
    base: BASE_REQUIREMENTS,
    extras: EXTRA_REQUIREMENTS,
    totalBase: Object.values(BASE_REQUIREMENTS).reduce((a, b) => a + b, 0),
    totalBasePlusExtras: GROUPS.reduce(
      (sum, group) => sum + BASE_REQUIREMENTS[group] + EXTRA_REQUIREMENTS[group],
      0
    ),
    totalRounds: 46,
  };
}

export function explainOverallPick(overallPick: number, coachCount: number) {
  return overallToRoundPick(overallPick, coachCount);
}