// app/api/admin/export-picks/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

function csvEscape(v: any) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const roomId = (url.searchParams.get("room") ?? "").trim();
    if (!roomId) return NextResponse.json({ ok: false, error: "room param is required" }, { status: 400 });

    const { data: picks, error: picksErr } = await supabaseAdmin
      .from("draft_picks")
      .select("room_id,overall_pick,round,pick_in_round,coach_id,player_no,created_at")
      .eq("room_id", roomId)
      .order("overall_pick", { ascending: true });

    if (picksErr) {
      return NextResponse.json({ ok: false, error: `draft_picks load error: ${picksErr.message}` }, { status: 500 });
    }

    const playerNos = Array.from(new Set((picks ?? []).map((p) => p.player_no))).filter(Boolean);

    // optional enrich from players table (if columns exist)
    const playerByNo = new Map<number, any>();
    if (playerNos.length) {
      const { data: players, error: playersErr } = await supabaseAdmin
        .from("players")
        .select("player_no,player_name,pos,club,average")
        .eq("room_id", roomId)
        .in("player_no", playerNos);

      if (!playersErr) {
        for (const p of players ?? []) playerByNo.set(p.player_no, p);
      }
    }

    const header = [
      "room_id",
      "overall_pick",
      "round",
      "pick_in_round",
      "coach_id",
      "player_no",
      "player_name",
      "pos",
      "club",
      "average",
      "created_at",
    ];

    const rows = (picks ?? []).map((p) => {
      const pl = playerByNo.get(p.player_no);
      return [
        p.room_id,
        p.overall_pick,
        p.round,
        p.pick_in_round,
        p.coach_id,
        p.player_no,
        pl?.player_name ?? "",
        pl?.pos ?? "",
        pl?.club ?? "",
        pl?.average ?? "",
        p.created_at,
      ]
        .map(csvEscape)
        .join(",");
    });

    const csv = [header.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="draft_picks_${roomId}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}