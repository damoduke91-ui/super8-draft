import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type DraftStateRow = {
  room_id: string;
  is_paused: boolean;
  pause_reason: string | null;
  rounds_total: number;
  current_round: number;
  current_pick_in_round: number;
  current_coach_id: number;
};

type LastPickedPlayerRow = {
  player_no: number;
  player_name: string;
  drafted_by_coach_id: number | null;
  drafted_round: number | null;
  drafted_pick: number | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomId = String(body?.roomId || "").trim();

    if (!roomId) {
      return NextResponse.json({ ok: false, error: "roomId is required" }, { status: 400 });
    }

    const { data: draftState, error: draftStateError } = await supabaseAdmin
      .from("draft_state")
      .select("room_id,is_paused,pause_reason,rounds_total,current_round,current_pick_in_round,current_coach_id")
      .eq("room_id", roomId)
      .maybeSingle();

    if (draftStateError) {
      return NextResponse.json({ ok: false, error: draftStateError.message }, { status: 500 });
    }

    if (!draftState) {
      return NextResponse.json({ ok: false, error: "No draft_state row found for this room" }, { status: 400 });
    }

    const { data: lastPicked, error: lastPickedError } = await supabaseAdmin
      .from("players")
      .select("player_no,player_name,drafted_by_coach_id,drafted_round,drafted_pick")
      .eq("room_id", roomId)
      .not("drafted_by_coach_id", "is", null)
      .order("drafted_round", { ascending: false })
      .order("drafted_pick", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastPickedError) {
      return NextResponse.json({ ok: false, error: lastPickedError.message }, { status: 500 });
    }

    if (!lastPicked) {
      return NextResponse.json({ ok: false, error: "No drafted player found to undo" }, { status: 400 });
    }

    const player = lastPicked as LastPickedPlayerRow;

    if (
      player.drafted_by_coach_id == null ||
      player.drafted_round == null ||
      player.drafted_pick == null
    ) {
      return NextResponse.json(
        { ok: false, error: "Latest drafted player is missing draft metadata" },
        { status: 400 }
      );
    }

    const { error: clearPlayerError } = await supabaseAdmin
      .from("players")
      .update({
        drafted_by_coach_id: null,
        drafted_round: null,
        drafted_pick: null,
      })
      .eq("room_id", roomId)
      .eq("player_no", player.player_no);

    if (clearPlayerError) {
      return NextResponse.json({ ok: false, error: clearPlayerError.message }, { status: 500 });
    }

    const state = draftState as DraftStateRow;

    const { error: updateDraftStateError } = await supabaseAdmin
      .from("draft_state")
      .update({
        is_paused: false,
        pause_reason: null,
        rounds_total: state.rounds_total,
        current_round: player.drafted_round,
        current_pick_in_round: player.drafted_pick,
        current_coach_id: player.drafted_by_coach_id,
      })
      .eq("room_id", roomId);

    if (updateDraftStateError) {
      return NextResponse.json({ ok: false, error: updateDraftStateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      roomId,
      playerNo: player.player_no,
      playerName: player.player_name,
      coachId: player.drafted_by_coach_id,
      round: player.drafted_round,
      pick: player.drafted_pick,
      message: "Last pick undone successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}