import { Suspense } from "react";
import AdminClient from "./AdminClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading admin…</div>}>
      <AdminClient />
    </Suspense>
  );
}
