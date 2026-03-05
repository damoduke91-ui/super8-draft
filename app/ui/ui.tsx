// app/ui/ui.tsx
import React from "react";

export function Page({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
        <div style={{ padding: "18px 18px 10px" }}>
          <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.3 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>{subtitle}</div> : null}
        </div>

        <div style={{ display: "grid", gap: 14 }}>{children}</div>
      </div>
    </div>
  );
}

export function Card({ title, right, children }: { title?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        boxShadow: "0 1px 10px rgba(0,0,0,0.05)",
      }}
    >
      {title || right ? (
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid #f1f2f4",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 950 }}>{title}</div>
          {right}
        </div>
      ) : null}
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export function Button({ variant = "secondary", style, ...props }: BtnProps) {
  const base: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    fontWeight: 950,
    border: "2px solid #111",
    cursor: props.disabled ? "not-allowed" : "pointer",
    opacity: props.disabled ? 0.6 : 1,
    userSelect: "none",
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: { background: "#111", color: "#fff" },
    secondary: { background: "#fff", color: "#111" },
    danger: { background: "#fff", color: "#b91c1c", border: "2px solid #b91c1c" },
  };

  return <button {...props} style={{ ...base, ...variants[variant], ...style }} />;
}

export function SmallText({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, opacity: 0.75 }}>{children}</div>;
}