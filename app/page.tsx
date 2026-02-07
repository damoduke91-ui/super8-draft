export default function HomePage() {
  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 16,
    background: "white",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const linkStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    textDecoration: "none",
    color: "#111827",
    background: "#f9fafb",
    fontWeight: 700,
  };

  const badgeStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "white",
    color: "#111827",
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 20% 10%, rgba(59,130,246,0.10), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(16,185,129,0.10), transparent 55%), #ffffff",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px 48px" }}>
        {/* Header */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 18,
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2, color: "#111827" }}>
                Super 8 Draft
              </div>
              <div style={{ marginTop: 6, color: "#4b5563", fontSize: 14, lineHeight: 1.4 }}>
                Quick links to join, draft, admin controls, and the live board.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={badgeStyle}>Next.js</span>
              <span style={badgeStyle}>Supabase</span>
              <span style={badgeStyle}>Vercel</span>
            </div>
          </div>
        </div>

        {/* Content grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 14 }}>
          {/* Left column */}
          <div style={{ gridColumn: "span 7" as any, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#111827" }}>Start here</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                Use <strong>/join</strong> to jump into a room, then head to <strong>/draft</strong> to pick players.
              </div>

              <a style={linkStyle} href="/join">
                <span>Join</span>
                <span style={{ opacity: 0.6 }}>→</span>
              </a>

              <a style={linkStyle} href="/draft">
                <span>Draft Screen</span>
                <span style={{ opacity: 0.6 }}>→</span>
              </a>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#111827" }}>Admin & Board</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                Admin is where you control setup. Board is the TV-friendly live view.
              </div>

              <a style={linkStyle} href="/admin">
                <span>Admin</span>
                <span style={{ opacity: 0.6 }}>→</span>
              </a>

              <a style={linkStyle} href="/board">
                <span>Draft Board</span>
                <span style={{ opacity: 0.6 }}>→</span>
              </a>
            </div>
          </div>

          {/* Right column */}
          <div style={{ gridColumn: "span 5" as any, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#111827" }}>Tip</div>
              <div style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
                You can open the board on a TV like:
                <div style={{ marginTop: 8, padding: 10, borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 }}>
                  /board?room=DUMMY1
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#111827" }}>What’s next?</div>
              <div style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
                Once you confirm everything is working, we can:
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  <li>Make it look even cleaner</li>
                  <li>Add search / filters</li>
                  <li>Add “nice to have” features</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 18, color: "#6b7280", fontSize: 12 }}>
          Built for your Super 8 draft — deploy-ready on Vercel.
        </div>
      </div>
    </div>
  );
}

