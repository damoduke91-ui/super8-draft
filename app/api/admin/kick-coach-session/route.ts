import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const roomId = String(body?.roomId ?? "").trim();
    const coachId = Number(body?.coachId);

    if (!roomId) {
      return NextResponse.json({ ok: false, error: "roomId is required" }, { status: 400 });
    }

    if (!Number.isFinite(coachId) || coachId <= 0) {
      return NextResponse.json({ ok: false, error: "coachId is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("coaches")
      .update({ session_id: null })
      .eq("room_id", roomId)
      .eq("coach_id", coachId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      roomId,
      coachId,
      message: "Coach session cleared",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}