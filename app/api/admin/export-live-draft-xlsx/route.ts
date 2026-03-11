import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type AnyRow = Record<string, any>;

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(value: unknown): string {
  return value == null ? "" : String(value);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("room_id") || "DUMMY1";

    // Read only:
    // this route does NOT update draft_state, players, draft_order, or any other data.
    // it only reads the drafted result and creates an XLSX file.

    const { data: players, error: playersError } = await supabaseAdmin
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .not("drafted_by_coach_id", "is", null);

    if (playersError) {
      return NextResponse.json(
        { error: `Failed to load drafted players: ${playersError.message}` },
        { status: 500 }
      );
    }

    const { data: coaches, error: coachesError } = await supabaseAdmin
      .from("coaches")
      .select("*")
      .eq("room_id", roomId);

    if (coachesError) {
      return NextResponse.json(
        { error: `Failed to load coaches: ${coachesError.message}` },
        { status: 500 }
      );
    }

    const coachNameById = new Map<number, string>();
    for (const coach of coaches ?? []) {
      coachNameById.set(
        toNumber((coach as AnyRow).coach_id),
        safeString((coach as AnyRow).coach_name)
      );
    }

    const draftedPlayers = [...((players ?? []) as AnyRow[])];

    draftedPlayers.sort((a, b) => {
      const roundDiff =
        toNumber(a.drafted_round, 9999) - toNumber(b.drafted_round, 9999);
      if (roundDiff !== 0) return roundDiff;

      const pickInRoundDiff =
        toNumber(a.drafted_pick_in_round, 9999) -
        toNumber(b.drafted_pick_in_round, 9999);
      if (pickInRoundDiff !== 0) return pickInRoundDiff;

      const overallPickDiff =
        toNumber(a.drafted_overall_pick, 9999) -
        toNumber(b.drafted_overall_pick, 9999);
      if (overallPickDiff !== 0) return overallPickDiff;

      const draftedAtA = safeString(a.drafted_at);
      const draftedAtB = safeString(b.drafted_at);
      return draftedAtA.localeCompare(draftedAtB);
    });

    const rows = draftedPlayers.map((player, index) => {
      const coachId = toNumber(player.drafted_by_coach_id);

      const draftedRound =
        player.drafted_round == null ? "" : toNumber(player.drafted_round);

      const draftedPickInRound =
        player.drafted_pick_in_round == null
          ? ""
          : toNumber(player.drafted_pick_in_round);

      const draftedOverallPick =
        player.drafted_overall_pick == null
          ? index + 1
          : toNumber(player.drafted_overall_pick);

      return {
        "Overall Pick": draftedOverallPick,
        Round: draftedRound,
        "Pick In Round": draftedPickInRound,
        "Coach ID": coachId,
        "Coach Name": coachNameById.get(coachId) || "",
        "Player No": player.player_no ?? "",
        "Player Name": player.player_name ?? "",
        Pos: player.pos ?? "",
        Club: player.club ?? "",
        Average: player.average ?? "",
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    (ws as AnyRow)["!cols"] = [
      { wch: 12 }, // Overall Pick
      { wch: 8 },  // Round
      { wch: 14 }, // Pick In Round
      { wch: 10 }, // Coach ID
      { wch: 20 }, // Coach Name
      { wch: 10 }, // Player No
      { wch: 28 }, // Player Name
      { wch: 8 },  // Pos
      { wch: 14 }, // Club
      { wch: 10 }, // Average
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Live Draft Result");

    const buffer = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx",
    });

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const filename = `live-draft-result-${roomId}-${y}-${m}-${d}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown export error";

    return NextResponse.json(
      { error: `Live draft export failed: ${message}` },
      { status: 500 }
    );
  }
}