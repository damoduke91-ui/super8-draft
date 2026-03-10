import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type DraftOrderRow = {
  overall_pick: number;
  coach_id: number;
};

type DraftedPlayerRow = {
  drafted_pick: number | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomId = String(body?.roomId ?? "").trim();

    if (!roomId) {
      return NextResponse.json({ ok: false, error: "roomId is required" }, { status: 400 });
    }

    const { data: draftState, error: draftStateError } = await supabaseAdmin
      .from("draft_state")
      .select("room_id, is_paused, pause_reason, rounds_total")
      .eq("room_id", roomId)
      .maybeSingle();

    if (draftStateError) {
      return NextResponse.json(
        { ok: false, error: `draft_state lookup failed: ${draftStateError.message}` },
        { status: 500 }
      );
    }

    const roundsTotal = Number(draftState?.rounds_total ?? 46);

    const { data: orderRows, error: orderError } = await supabaseAdmin
      .from("draft_order")
      .select("overall_pick, coach_id")
      .eq("room_id", roomId)
      .order("overall_pick", { ascending: true });

    if (orderError) {
      return NextResponse.json(
        { ok: false, error: `draft_order lookup failed: ${orderError.message}` },
        { status: 500 }
      );
    }

    const order = ((orderRows as DraftOrderRow[] | null) ?? []).filter(
      (r) => Number.isFinite(r.overall_pick) && Number.isFinite(r.coach_id)
    );

    if (order.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No draft_order rows found for this room" },
        { status: 400 }
      );
    }

    const maxOverallPick = order[order.length - 1].overall_pick;
    const coachCount = new Set(order.map((r) => r.coach_id)).size;

    if (!coachCount) {
      return NextResponse.json(
        { ok: false, error: "Could not determine coach count from draft_order" },
        { status: 400 }
      );
    }

    const { data: draftedPlayers, error: draftedPlayersError } = await supabaseAdmin
      .from("players")
      .select("drafted_pick")
      .eq("room_id", roomId)
      .not("drafted_pick", "is", null);

    if (draftedPlayersError) {
      return NextResponse.json(
        { ok: false, error: `players lookup failed: ${draftedPlayersError.message}` },
        { status: 500 }
      );
    }

    const drafted = ((draftedPlayers as DraftedPlayerRow[] | null) ?? [])
      .map((p) => Number(p.drafted_pick))
      .filter((n) => Number.isFinite(n) && n > 0);

    const draftedCount = drafted.length;
    const lastDraftedPick = draftedCount ? Math.max(...drafted) : 0;

    let nextOverallPick = lastDraftedPick + 1;
    let isPaused = Boolean(draftState?.is_paused ?? true);
    let pauseReason = draftState?.pause_reason ?? null;

    if (draftedCount >= maxOverallPick) {
      nextOverallPick = maxOverallPick;
      isPaused = true;
      pauseReason = "Draft complete";
    }

    const nextOrderRow = order.find((r) => r.overall_pick === nextOverallPick) ?? null;

    let currentRound = roundsTotal;
    let currentPickInRound = coachCount;
    let currentCoachId = order[order.length - 1].coach_id;

    if (nextOrderRow) {
      currentRound = Math.floor((nextOverallPick - 1) / coachCount) + 1;
      currentPickInRound = ((nextOverallPick - 1) % coachCount) + 1;
      currentCoachId = nextOrderRow.coach_id;
    }

    const upsertPayload = {
      room_id: roomId,
      is_paused: isPaused,
      pause_reason: pauseReason,
      rounds_total: roundsTotal,
      current_round: currentRound,
      current_pick_in_round: currentPickInRound,
      current_coach_id: currentCoachId,
    };

    const { error: upsertError } = await supabaseAdmin
      .from("draft_state")
      .upsert(upsertPayload, { onConflict: "room_id" });

    if (upsertError) {
      return NextResponse.json(
        { ok: false, error: `draft_state update failed: ${upsertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Draft state repaired",
      summary: {
        room_id: roomId,
        drafted_count: draftedCount,
        max_overall_pick: maxOverallPick,
        current_round: currentRound,
        current_pick_in_round: currentPickInRound,
        current_coach_id: currentCoachId,
        is_paused: isPaused,
        pause_reason: pauseReason,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}