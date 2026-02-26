import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  room_id: string;
  updates: { overall_pick: number; coach_id: number }[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const room_id = (body.room_id || "").trim();
    const updates = Array.isArray(body.updates) ? body.updates : [];

    if (!room_id) {
      return NextResponse.json({ ok: false, message: "room_id is required" }, { status: 400 });
    }
    if (!updates.length) {
      return NextResponse.json({ ok: false, message: "updates is empty" }, { status: 400 });
    }

    // Basic validation
    for (const u of updates) {
      if (!Number.isFinite(u.overall_pick) || u.overall_pick <= 0) {
        return NextResponse.json({ ok: false, message: "Invalid overall_pick" }, { status: 400 });
      }
      if (!Number.isFinite(u.coach_id) || u.coach_id <= 0) {
        return NextResponse.json({ ok: false, message: "Invalid coach_id" }, { status: 400 });
      }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, message: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

    const rows = updates.map((u) => ({
      room_id,
      overall_pick: u.overall_pick,
      coach_id: u.coach_id,
    }));

    const { error } = await supabaseAdmin
      .from("draft_order")
      .upsert(rows, { onConflict: "room_id,overall_pick" });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: rows.length });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
