import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  console.log(">>> HIT /api/admin/generate-snake POST");
  console.log(">>> Service key loaded:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();

    const {
      room_id,
      round_from,
      round_to,
      coach_ids,
      shuffle = false,
      seed = null,
    } = body;

    if (!room_id || !round_from || !round_to || !Array.isArray(coach_ids)) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid parameters" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabaseAdmin.rpc("generate_snake_block", {
      p_room_id: room_id,
      p_round_from: round_from,
      p_round_to: round_to,
      p_coach_ids: coach_ids,
      p_shuffle: shuffle,
      p_seed: seed,
    });

    if (error) {
      console.error("Snake generation RPC error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Route error:", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}

