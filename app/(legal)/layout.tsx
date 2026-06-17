import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100%", background: "var(--bg)", color: "var(--ink)" }}>
      <header style={{ borderBottom: "1px solid var(--line)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "var(--ink)" }}>
          <img src="/brand/Altvary.png" alt="Altvary" style={{ height: 24, width: "auto" }} />
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
