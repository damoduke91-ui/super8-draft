import type { Metadata } from "next";
import AdminClient from "./AdminClient";

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

  let title = "Admin";
  if (room && coach) title = `Admin ${room} (Coach ${coach})`;
  else if (room) title = `Admin ${room}`;

  return { title };
}

export default function Page() {
  return <AdminClient />;
}
