import { NextResponse } from "next/server";
import { getRosterTargets, runDraftSimulation } from "@/app/lib/draftSimulator";

type Body = {
  roomId: string;
  rounds?: number;
  manualCoachIds?: number[];
  resetDraft?: boolean;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const roomId = (body.roomId ?? "").trim();

    if (!roomId) {
      return NextResponse.json(
        { ok: false, error: "roomId is required" },
        { status: 400 }
      );
    }

    const result = await runDraftSimulation({
      roomId,
      rounds: body.rounds,
      manualCoachIds: body.manualCoachIds ?? [],
      resetDraft: body.resetDraft,
    });

    return NextResponse.json({
      ...result,
      rosterTargets: getRosterTargets(),
    });

  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}