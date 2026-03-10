import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const POSITION_KEYS = ["KD", "DEF", "MID", "FOR", "KF", "RUC"] as const;
type PositionKey = (typeof POSITION_KEYS)[number];

type RankingRow = {
  position_key: PositionKey;
  rank_no: number;
  player_no: number;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = String(searchParams.get("roomId") ?? "").trim().toUpperCase();
    const coachId = Number(searchParams.get("coachId") ?? "0");

    if (!roomId) {
      return NextResponse.json({ ok: false, error: "roomId is required" }, { status: 400 });
    }

    if (!Number.isFinite(coachId) || coachId <= 0) {
      return NextResponse.json({ ok: false, error: "coachId is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("coach_custom_position_rankings")
      .select("position_key, rank_no, player_no")
      .eq("room_id", roomId)
      .eq("coach_id", coachId)
      .order("position_key", { ascending: true })
      .order("rank_no", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Failed loading custom position rankings: ${error.message}` },
        { status: 500 }
      );
    }

    const rows = ((data as RankingRow[] | null) ?? []).filter(
      (r) =>
        POSITION_KEYS.includes(r.position_key) &&
        Number.isFinite(r.rank_no) &&
        Number.isFinite(r.player_no)
    );

    const orders: Record<PositionKey, number[]> = {
      KD: [],
      DEF: [],
      MID: [],
      FOR: [],
      KF: [],
      RUC: [],
    };

    for (const key of POSITION_KEYS) {
      orders[key] = rows
        .filter((r) => r.position_key === key)
        .sort((a, b) => a.rank_no - b.rank_no)
        .map((r) => r.player_no);
    }

    return NextResponse.json({
      ok: true,
      orders,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}