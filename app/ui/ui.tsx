// app/ui/ui.tsx
import React from "react";

const COLORS = {
  bg: "#f7f7f8",
  text: "#111827", // readable dark
  muted: "#6b7280", // readable grey
  border: "#e5e7eb",
  borderSoft: "#f1f2f4",
  cardBg: "#ffffff",
};

export function Page({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
        <div style={{ padding: "18px 18px 10px" }}>
          <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.3, color: COLORS.text }}>
            {title}
          </div>

          {subtitle ? (
            <div style={{ marginTop: 6, fontSize: 13, color: COLORS.muted, lineHeight: 1.4 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 14 }}>{children}</div>
      </div>
    </div>
  );
}

export function Card({
  title,
  right,
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        boxShadow: "0 1px 10px rgba(0,0,0,0.05)",
        color: COLORS.text,
      }}
    >
      {title || right ? (
        <div
          style={{
            padding: "12px 14px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 950, color: COLORS.text }}>{title}</div>
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
    opacity: props.disabled ? 0.55 : 1,
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
  return <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.4 }}>{children}</div>;
}