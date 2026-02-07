import { Suspense } from "react";
import BoardClient from "./BoardClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading board…</div>}>
      <BoardClient />
    </Suspense>
  );
}
