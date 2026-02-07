import { Suspense } from "react";
import DraftClient from "./DraftClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading draft…</div>}>
      <DraftClient />
    </Suspense>
  );
}
