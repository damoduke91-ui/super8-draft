import { Suspense } from "react";
import JoinClient from "./JoinClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading join…</div>}>
      <JoinClient />
    </Suspense>
  );
}


