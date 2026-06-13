"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Normalize whatever the merchant types into a bare store handle (the part before
 * .myshopify.com). Handles pasted full URLs, the admin.shopify.com/store/<handle>
 * form, a trailing .myshopify.com, protocols, and stray paths.
 */
function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^admin\.shopify\.com\/store\//, "")
    .replace(/\.myshopify\.com.*$/, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9-]/g, "");
}

export default function ConnectPage() {
  const [shop, setShop] = useState("");
  const [state, setState] = useState<"idle" | "connecting" | "connected">("idle");
  const [error, setError] = useState(false);

  function install() {
    const handle = normalizeHandle(shop);
    if (!handle) { setError(true); return; }
    setError(false);
    setState("connecting");
    // Hand off to the real OAuth install — this 307s to Shopify's consent screen.
    window.location.assign(`/api/shopify/install?shop=${handle}.myshopify.com`);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ width: "100%", maxWidth: 440, padding: "0 20px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 36 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--ink)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 16, letterSpacing: "-.02em" }}>A</div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.02em" }}>Alt<b>vary</b></div>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)", overflow: "hidden" }}>

          {/* Hero */}
          <div style={{ background: "linear-gradient(135deg,#0a0a0a 0%,#1a1a2e 100%)", padding: "36px 32px 32px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "#fff", color: "#0a0a0a", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22, letterSpacing: "-.04em" }}>A</div>
              <div style={{ color: "rgba(255,255,255,.35)", fontSize: 20, fontWeight: 300, lineHeight: 1 }}>+</div>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "#fff", display: "grid", placeItems: "center" }}>
                <img src="/shopify_icon.svg" alt="Shopify" width={30} height={30} />
              </div>
            </div>
            <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", margin: 0 }}>Connect your Shopify store</h1>
            <p style={{ color: "rgba(255,255,255,.55)", fontSize: 13, margin: 0, lineHeight: 1.55, maxWidth: 300 }}>Altvary will analyse your order history and start scoring customers within minutes of connecting.</p>
          </div>

          {/* Body */}
          <div style={{ padding: "28px 32px 32px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
              <label htmlFor="shop-url" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>Your store URL</label>
            </div>
            <div style={{ display: "flex", alignItems: "stretch", border: `1px solid ${error ? "var(--neg)" : state === "connected" ? "var(--green)" : "var(--line)"}`, borderRadius: "var(--r-sm)", background: "var(--bg)", overflow: "hidden", transition: "border-color .12s" }}>
              <input
                id="shop-url"
                type="text"
                placeholder="yourstore"
                autoComplete="off"
                spellCheck={false}
                value={shop}
                disabled={state !== "idle"}
                onChange={e => { setShop(e.target.value); setError(false); }}
                onKeyDown={e => { if (e.key === "Enter") install(); }}
                style={{ flex: 1, border: "none", background: "transparent", padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink)", outline: "none", minWidth: 0 }}
              />
              {state !== "connected" && (
                <div style={{ display: "flex", alignItems: "center", padding: "0 12px", borderLeft: "1px solid var(--line)", background: "var(--card-2)", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>.myshopify.com</div>
              )}
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--faint)", marginBottom: 18, marginTop: 6 }}>Your store handle — the part before <b>.myshopify.com</b> (the handle in your <span style={{ fontFamily: "var(--mono)" }}>admin.shopify.com/store/…</span> URL).</div>

            <button
              onClick={install}
              disabled={state !== "idle"}
              style={{ width: "100%", padding: 13, borderRadius: "var(--r-xs)", background: state === "connected" ? "#4caf50" : "#96BF48", color: "#fff", fontFamily: "var(--sans)", fontSize: 14, fontWeight: 700, border: "none", cursor: state !== "idle" ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxSizing: "border-box", marginTop: 20 }}
            >
              {state === "idle" && (
                <>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: "#fff", display: "grid", placeItems: "center" }}>
                    <img src="/shopify_icon.svg" alt="" width={15} height={15} />
                  </span>
                  Install Altvary on Shopify
                </>
              )}
              {state === "connecting" && "Connecting to Shopify…"}
              {state === "connected" && "Connected — starting analysis…"}
            </button>

            <div style={{ marginTop: 22, padding: 16, borderRadius: "var(--r-sm)", background: "var(--card-2)", border: "1px solid var(--line)" }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 12px" }}>Permissions requested</p>
              {[
                "Read orders & customers — to calculate RFME scores",
                "Read products — to enrich recommendation context",
                "No write access to your store or checkout",
                "Data isolated per store — never shared across tenants",
              ].map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: "12.5px", color: "var(--ink-2)", lineHeight: 1.45, marginBottom: i < 3 ? 9 : 0 }}>
                  <i className="ti ti-check" style={{ color: "var(--pos)", fontSize: 14, flexShrink: 0, marginTop: 1 }}></i>
                  <span>{p}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", marginTop: 20, fontSize: "12.5px", color: "var(--muted)" }}>
              Already have an account? <Link href="/login" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>Sign in instead</Link>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 28, fontSize: 11, color: "var(--faint)", lineHeight: 1.6 }}>
          By installing you agree to our <a href="/terms" style={{ color: "var(--muted)" }}>Terms of Service</a> and <a href="/privacy" style={{ color: "var(--muted)" }}>Privacy Policy</a>.<br />
          Your store data is processed in an isolated tenant silo.
        </div>
      </div>
    </div>
  );
}
