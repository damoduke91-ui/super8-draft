import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const roomId = body.roomId ?? body.room_id;

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

    // Find starting coach from draft_order (overall_pick = 1)
    const { data: firstPick, error: firstPickErr } = await supabase
      .from("draft_order")
      .select("coach_id")
      .eq("room_id", roomId)
      .eq("overall_pick", 1)
      .maybeSingle();

    if (firstPickErr) {
      return NextResponse.json({ error: firstPickErr.message }, { status: 400 });
    }

    const startingCoachId = firstPick?.coach_id ?? 1;

    // Create OR update draft_state (upsert) so it exists for DraftClient
    const { error: upsertErr } = await supabase.from("draft_state").upsert(
      {
        room_id: roomId,
        is_paused: false,
        pause_reason: null,
        rounds_total: 46, // <-- change if your league uses a different total
        current_round: 1,
        current_pick_in_round: 1,
        current_coach_id: startingCoachId,
      },
      { onConflict: "room_id" }
    );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}