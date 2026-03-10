import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const REQUIRED_TABS = ["KD", "DEF", "MID", "FOR", "KF", "RUC"] as const;
type PositionKey = (typeof REQUIRED_TABS)[number];

type ImportRow = {
  room_id: string;
  coach_id: number;
  position_key: PositionKey;
  rank_no: number;
  player_no: number;
  player_name: string;
};

function normHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getHeaderIndex(headers: unknown[], allowed: string[]) {
  const normalized = headers.map(normHeader);
  return normalized.findIndex((h) => allowed.includes(h));
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const roomId = String(form.get("roomId") ?? "")
      .trim()
      .toUpperCase();
    const file = form.get("file");

    if (!roomId) {
      return NextResponse.json({ ok: false, error: "roomId is required" }, { status: 400 });
    }

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Spreadsheet file is required" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer" });

    const warnings: string[] = [];
    const importRows: ImportRow[] = [];
    const summary: Record<string, number> = {
      KD: 0,
      DEF: 0,
      MID: 0,
      FOR: 0,
      KF: 0,
      RUC: 0,
    };

    for (const tabName of REQUIRED_TABS) {
      const sheet = workbook.Sheets[tabName];

      if (!sheet) {
        warnings.push(`Missing tab: ${tabName}`);
        continue;
      }

      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
      });

      if (!rows.length) {
        warnings.push(`Empty tab: ${tabName}`);
        continue;
      }

      const headers = rows[0] ?? [];
      const rankIdx = getHeaderIndex(headers, ["rank"]);
      const playerNoIdx = getHeaderIndex(headers, ["no.", "no", "player no", "player number"]);
      const playerNameIdx = getHeaderIndex(headers, ["player", "player name"]);

      if (rankIdx === -1 || playerNoIdx === -1 || playerNameIdx === -1) {
        warnings.push(`Tab ${tabName} is missing required headers. Need Rank, No./No., and Player`);
        continue;
      }

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] ?? [];

        const rankNo = Number(String(row[rankIdx] ?? "").trim());
        const playerNo = Number(String(row[playerNoIdx] ?? "").trim());
        const playerName = String(row[playerNameIdx] ?? "").trim();

        if (!Number.isFinite(rankNo) || rankNo <= 0) continue;
        if (!Number.isFinite(playerNo) || playerNo <= 0) continue;
        if (!playerName) continue;

        importRows.push({
          room_id: roomId,
          coach_id: 3,
          position_key: tabName,
          rank_no: rankNo,
          player_no: playerNo,
          player_name: playerName,
        });

        summary[tabName] += 1;
      }
    }

    if (!importRows.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "No valid ranking rows found in spreadsheet",
          warnings,
          workbookSheets: workbook.SheetNames,
        },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("coach_custom_position_rankings")
      .delete()
      .eq("room_id", roomId)
      .eq("coach_id", 3);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: `Failed clearing old Damian rankings: ${deleteError.message}` },
        { status: 500 }
      );
    }

    const { error: insertError } = await supabaseAdmin
      .from("coach_custom_position_rankings")
      .insert(importRows);

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: `Failed inserting Damian rankings: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      importedCount: importRows.length,
      summary,
      warnings,
      workbookSheets: workbook.SheetNames,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Unknown server error",
      },
      { status: 500 }
    );
  }
}