import type { Metadata } from "next";
import { Suspense } from "react";
import BoardClient from "./BoardClient";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function pickFirst(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return (v[0] ?? "").trim();
  return (v ?? "").trim();
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const sp = await searchParams;

  const room = pickFirst(sp.room);
  const coach = pickFirst(sp.coach);

  let title = "Draft Board";
  if (room && coach) title = `Draft Board ${room} (Coach ${coach})`;
  else if (room) title = `Draft Board ${room}`;

  return { title };
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading board…</div>}>
      <BoardClient />
    </Suspense>
  );
}