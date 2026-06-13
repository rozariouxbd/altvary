import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100%", background: "var(--bg)", color: "var(--ink)" }}>
      <header style={{ borderBottom: "1px solid var(--line)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "var(--ink)" }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14 }}>A</span>
          <span style={{ fontWeight: 700, letterSpacing: "-.01em" }}>Altvary</span>
        </Link>
        <nav style={{ display: "flex", gap: 18, fontSize: 13 }}>
          <Link href="/privacy" style={{ color: "var(--muted)", textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ color: "var(--muted)", textDecoration: "none" }}>Terms</Link>
          <Link href="/support" style={{ color: "var(--muted)", textDecoration: "none" }}>Support</Link>
        </nav>
      </header>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 96px" }}>{children}</main>
    </div>
  );
}
