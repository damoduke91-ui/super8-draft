// app/api/admin/simulate-draft/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

type Body = {
  roomId: string;
  coachIds?: number[]; // default [1,2]
  rounds?: number; // default 46
  pickRule?: "highest_average"; // for now only this
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const roomId = (body.roomId ?? "").trim();
    const coachIds = [1, 2];
    const rounds = Number.isFinite(body.rounds) ? Number(body.rounds) : 46;

    if (!roomId) return NextResponse.json({ ok: false, error: "roomId is required" }, { status: 400 });
    if (coachIds.length !== 2) {
      return NextResponse.json({ ok: false, error: "coachIds must be exactly 2 (e.g. [1,2])" }, { status: 400 });
    }

    // ---------------------------------------------------
// RESET simulation data
// ---------------------------------------------------

await supabaseAdmin
  .from("draft_picks")
  .delete()
  .eq("room_id", roomId);

await supabaseAdmin
  .from("players")
  .update({
    drafted_by_coach_id: null,
    drafted_round: null,
    drafted_pick: null,
  })
  .eq("room_id", roomId);

// remove any existing draft order
await supabaseAdmin
  .from("draft_order")
  .delete()
  .eq("room_id", roomId);

    // 1) Ensure draft_order exists for this room (2-coach snake)
    const totalPicks = rounds * 2;

    const { data: existingOrder, error: orderErr } = await supabaseAdmin
      .from("draft_order")
      .select("overall_pick,coach_id")
      .eq("room_id", roomId)
      .order("overall_pick", { ascending: true })
      .limit(1);

    if (orderErr) {
      return NextResponse.json({ ok: false, error: `draft_order load error: ${orderErr.message}` }, { status: 500 });
    }

    if (!existingOrder || existingOrder.length === 0) {
      const rows: { room_id: string; overall_pick: number; coach_id: number }[] = [];
      for (let r = 1; r <= rounds; r++) {
        const odd = r % 2 === 1;
        const first = odd ? coachIds[0] : coachIds[1];
        const second = odd ? coachIds[1] : coachIds[0];

        const op1 = (r - 1) * 2 + 1;
        const op2 = (r - 1) * 2 + 2;

        rows.push({ room_id: roomId, overall_pick: op1, coach_id: first });
        rows.push({ room_id: roomId, overall_pick: op2, coach_id: second });
      }

      const { error: insErr } = await supabaseAdmin.from("draft_order").insert(rows);
      if (insErr) {
        return NextResponse.json({ ok: false, error: `draft_order insert error: ${insErr.message}` }, { status: 500 });
      }
    }

    // 2) Ensure draft_state exists (simple upsert)
    // If you already have a dedicated start-draft route/RPC, we can call that later.
    const { error: dsUpsertErr } = await supabaseAdmin.from("draft_state").upsert(
      {
        room_id: roomId,
        is_paused: false,
        pause_reason: null,
        rounds_total: rounds,
        current_round: 1,
        current_pick_in_round: 1,
        current_coach_id: coachIds[0],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "room_id" }
    );

    if (dsUpsertErr) {
      return NextResponse.json({ ok: false, error: `draft_state upsert error: ${dsUpsertErr.message}` }, { status: 500 });
    }

    // 3) Load all players (we'll pick highest_average among undrafted each time)
    // Assumes players has: room_id, player_no, average, drafted_by_coach_id
    const { data: players, error: playersErr } = await supabaseAdmin
      .from("players")
      .select("player_no,average,drafted_by_coach_id")
      .eq("room_id", roomId);

    if (playersErr) {
      return NextResponse.json({ ok: false, error: `players load error: ${playersErr.message}` }, { status: 500 });
    }

    const pool = (players ?? [])
      .filter((p) => p.drafted_by_coach_id == null)
      .sort((a, b) => Number(b.average ?? 0) - Number(a.average ?? 0));

    if (pool.length === 0) {
      return NextResponse.json({ ok: false, error: "No undrafted players available in this room" }, { status: 400 });
    }

    // 4) Load draft_order for coach lookup
    const { data: orderAll, error: orderAllErr } = await supabaseAdmin
      .from("draft_order")
      .select("overall_pick,coach_id")
      .eq("room_id", roomId)
      .order("overall_pick", { ascending: true })
      .limit(totalPicks);

    if (orderAllErr) {
      return NextResponse.json({ ok: false, error: `draft_order load error: ${orderAllErr.message}` }, { status: 500 });
    }

    const coachByOverall = new Map<number, number>();
    for (const row of orderAll ?? []) coachByOverall.set(row.overall_pick, row.coach_id);

    // 5) Perform picks
    let picksDone = 0;

    for (let overall = 1; overall <= totalPicks; overall++) {
      const coachId = coachByOverall.get(overall) ?? coachIds[0];

      // pick highest remaining
      const next = pool.shift();
      if (!next) break;

      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("draft_pick", {
        p_room_id: roomId,
        p_player_no: next.player_no,
        p_coach_id: coachId,
        p_override_turn: true,
      });

      if (rpcErr) {
        return NextResponse.json({ ok: false, error: `draft_pick rpc error: ${rpcErr.message}`, overall }, { status: 500 });
      }

      // our RPC returns jsonb with ok/message
      if (!rpcData?.ok) {
        return NextResponse.json(
          { ok: false, error: rpcData?.message ?? "draft_pick failed", overall, details: rpcData },
          { status: 400 }
        );
      }

      picksDone++;
    }

    return NextResponse.json({ ok: true, message: "simulated", picksDone, roomId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}