import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const { roomId } = await req.json();

    if (!roomId) {
      return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const supabase = adminSupabase();

    // Find starting coach (overall_pick = 1)
    const { data: firstPick, error: firstPickErr } = await supabase
      .from("draft_order")
      .select("coach_id")
      .eq("room_id", roomId)
      .eq("overall_pick", 1)
      .maybeSingle();

    if (firstPickErr) {
      return NextResponse.json({ error: firstPickErr.message }, { status: 400 });
    }

    const startingCoachId = firstPick?.coach_id ?? null;

    // Reset draft state
    const { error: stateErr } = await supabase
      .from("draft_state")
      .update({
        is_paused: true,
        pause_reason: "Reset by admin",
        current_round: 1,
        current_pick_in_round: 1,
        current_coach_id: startingCoachId,
      })
      .eq("room_id", roomId);

    if (stateErr) return NextResponse.json({ error: stateErr.message }, { status: 400 });

    // Clear drafted fields on players (assumes players.room_id exists)
    const { error: playersErr } = await supabase
      .from("players")
      .update({
        drafted_by_coach_id: null,
        drafted_round: null,
        drafted_pick: null,
      })
      .eq("room_id", roomId);

    if (playersErr) {
      return NextResponse.json(
        { error: `Draft state reset, but failed clearing players: ${playersErr.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
