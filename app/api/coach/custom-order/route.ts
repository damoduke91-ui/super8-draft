import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const roomId = searchParams.get("roomId");
    const coachId = Number(searchParams.get("coachId"));

    if (!roomId) {
      return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
    }

    if (!coachId) {
      return NextResponse.json({ error: "Missing coachId" }, { status: 400 });
    }

    const supabase = adminSupabase();

    const { data, error } = await supabase
      .from("coach_custom_order")
      .select("player_no, rank")
      .eq("room_id", roomId)
      .eq("coach_id", coachId)
      .order("rank", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      order: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const roomId = body.roomId;
    const coachId = body.coachId;
    const order = body.order;

    if (!roomId) {
      return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
    }

    if (!coachId) {
      return NextResponse.json({ error: "Missing coachId" }, { status: 400 });
    }

    if (!Array.isArray(order)) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }

    const supabase = adminSupabase();

    const rows = order.map((player_no: number, i: number) => ({
      room_id: roomId,
      coach_id: coachId,
      player_no,
      rank: i + 1,
    }));

    const { error } = await supabase
      .from("coach_custom_order")
      .upsert(rows, { onConflict: "room_id,coach_id,player_no" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      saved: rows.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}