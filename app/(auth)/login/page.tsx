import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

export const metadata = { title: "Sign in — Altvary" };

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/today");
}

async function signUp(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (!data.session) redirect("/login?notice=confirm");
  redirect("/today");
}

async function sendMagicLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const base = process.env.SHOPIFY_APP_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${base}/api/auth/callback` },
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(`/login?notice=magic&email=${encodeURIComponent(email)}`);
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; email?: string }> }) {
  const sp = await searchParams;
  const inputStyle = {
    padding: "10px 14px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)",
    fontFamily: "var(--sans)", fontSize: 14, outline: "none", color: "var(--ink)", background: "var(--card)",
  } as const;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", fontFamily: "var(--sans)" }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)", padding: "40px", width: "100%", maxWidth: 380, boxShadow: "var(--shadow-lift)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
          <img src="/brand/Altvary.png" alt="Altvary" style={{ height: 30, width: "auto" }} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 6px" }}>Sign in</h1>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 24px" }}>Enter your email and password to continue.</p>

        {sp.error && (
          <div style={{ fontSize: 12.5, color: "var(--neg)", background: "var(--neg-soft)", padding: "10px 12px", borderRadius: "var(--r-sm)", marginBottom: 14 }}>{sp.error}</div>
        )}
        {sp.notice === "confirm" && (
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", background: "var(--accent-soft)", padding: "10px 12px", borderRadius: "var(--r-sm)", marginBottom: 14 }}>Account created — check your email to confirm, then sign in.</div>
        )}
        {sp.notice === "installed" && (
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", background: "var(--pos-soft)", padding: "10px 12px", borderRadius: "var(--r-sm)", marginBottom: 14 }}>✓ Store connected{sp.email ? ` for ${sp.email}` : ""}. Get a magic link below to access your dashboard.</div>
        )}
        {sp.notice === "magic" && (
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", background: "var(--accent-soft)", padding: "10px 12px", borderRadius: "var(--r-sm)", marginBottom: 14 }}>Magic link sent to {sp.email ?? "your email"} — click it to sign in.</div>
        )}

        <form style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input name="email" type="email" required placeholder="you@store.com" defaultValue={sp.email ?? ""} style={inputStyle} />
          <button formAction={sendMagicLink} type="submit" style={{ padding: "10px 14px", borderRadius: "var(--r-xs)", background: "var(--accent)", color: "#fff", border: "none", fontFamily: "var(--sans)", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 4 }}><i className="ti ti-mail" style={{ verticalAlign: -2, marginRight: 6 }} />Email me a magic link</button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0" }}>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span style={{ fontSize: 11, color: "var(--faint)" }}>or password</span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>

          <input name="password" type="password" placeholder="Password" minLength={6} style={inputStyle} />
          <div style={{ display: "flex", gap: 8 }}>
            <button formAction={signIn} type="submit" style={{ flex: 1, padding: "10px 14px", borderRadius: "var(--r-xs)", background: "var(--card)", color: "var(--ink-2)", border: "1px solid var(--line)", fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Sign in</button>
            <button formAction={signUp} type="submit" style={{ flex: 1, padding: "10px 14px", borderRadius: "var(--r-xs)", background: "var(--card)", color: "var(--ink-2)", border: "1px solid var(--line)", fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Create account</button>
          </div>
        </form>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 20, textAlign: "center" }}>
          New merchant? <a href="/connect" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>Install on Shopify</a>
        </p>
      </div>
    </div>
  );
}
