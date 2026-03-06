import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type DraftPickRow = {
  room_id: string;
  overall_pick: number;
  round: number;
  pick_in_round: number;
  coach_id: number;
  player_no: number;
  created_at: string | null;
};

type PlayerRow = {
  room_id: string;
  player_no: number;
  player_name: string;
  pos: string;
  club: string;
  average: number | null;
};

type CoachRow = {
  room_id: string;
  coach_id: number;
  coach_name: string;
};

function safeSheetName(name: string) {
  const cleaned = name.replace(/[:\\/?*\[\]]/g, " ").trim();
  return cleaned.slice(0, 31) || "Sheet";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const roomId = (url.searchParams.get("room") ?? "").trim();

    if (!roomId) {
      return NextResponse.json({ ok: false, error: "room param is required" }, { status: 400 });
    }

    const [picksRes, playersRes, coachesRes] = await Promise.all([
      supabaseAdmin
        .from("draft_picks")
        .select("room_id,overall_pick,round,pick_in_round,coach_id,player_no,created_at")
        .eq("room_id", roomId)
        .order("overall_pick", { ascending: true }),
      supabaseAdmin
        .from("players")
        .select("room_id,player_no,player_name,pos,club,average")
        .eq("room_id", roomId),
      supabaseAdmin
        .from("coaches")
        .select("room_id,coach_id,coach_name")
        .eq("room_id", roomId)
        .order("coach_id", { ascending: true }),
    ]);

    if (picksRes.error) {
      return NextResponse.json(
        { ok: false, error: `draft_picks load error: ${picksRes.error.message}` },
        { status: 500 }
      );
    }

    if (playersRes.error) {
      return NextResponse.json(
        { ok: false, error: `players load error: ${playersRes.error.message}` },
        { status: 500 }
      );
    }

    if (coachesRes.error) {
      return NextResponse.json(
        { ok: false, error: `coaches load error: ${coachesRes.error.message}` },
        { status: 500 }
      );
    }

    const picks = (picksRes.data ?? []) as DraftPickRow[];
    const players = (playersRes.data ?? []) as PlayerRow[];
    const coaches = (coachesRes.data ?? []) as CoachRow[];

    const playerByNo = new Map<number, PlayerRow>();
    for (const p of players) playerByNo.set(p.player_no, p);

    const coachNameById = new Map<number, string>();
    for (const c of coaches) coachNameById.set(c.coach_id, c.coach_name);

    const overallRows = picks.map((pick) => {
      const pl = playerByNo.get(pick.player_no);
      return {
        room_id: pick.room_id,
        overall_pick: pick.overall_pick,
        round: pick.round,
        pick_in_round: pick.pick_in_round,
        coach_id: pick.coach_id,
        coach_name: coachNameById.get(pick.coach_id) ?? `Coach ${pick.coach_id}`,
        player_no: pick.player_no,
        player_name: pl?.player_name ?? "",
        pos: pl?.pos ?? "",
        club: pl?.club ?? "",
        average: pl?.average ?? "",
        created_at: pick.created_at ?? "",
      };
    });

    const workbook = XLSX.utils.book_new();

    const overallSheet = XLSX.utils.json_to_sheet(overallRows);
    XLSX.utils.book_append_sheet(workbook, overallSheet, "Overall Picks");

    const coachIdsInPicks = Array.from(new Set(picks.map((p) => p.coach_id))).sort((a, b) => a - b);
    const coachIds = coaches.length
      ? coaches.map((c) => c.coach_id).sort((a, b) => a - b)
      : coachIdsInPicks;

    for (const coachId of coachIds) {
      const coachName = coachNameById.get(coachId) ?? `Coach ${coachId}`;

      const coachRows = picks
        .filter((p) => p.coach_id === coachId)
        .map((pick) => {
          const pl = playerByNo.get(pick.player_no);
          return {
            coach_id: coachId,
            coach_name: coachName,
            player_no: pick.player_no,
            player_name: pl?.player_name ?? "",
            pos: pl?.pos ?? "",
            club: pl?.club ?? "",
            average: pl?.average ?? "",
            overall_pick: pick.overall_pick,
            round: pick.round,
            pick_in_round: pick.pick_in_round,
            created_at: pick.created_at ?? "",
          };
        })
        .sort((a, b) => a.player_no - b.player_no);

      const ws = XLSX.utils.json_to_sheet(coachRows);
      XLSX.utils.book_append_sheet(workbook, ws, safeSheetName(`${coachName}`));
    }

    const xlsxBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    return new NextResponse(xlsxBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="draft_picks_${roomId}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}