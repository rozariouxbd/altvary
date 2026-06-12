import { redirect } from "next/navigation";
import Topbar from "../../components/Topbar";
import { prisma } from "../../../lib/prisma";
import { getCurrentStore, getCurrentUser } from "../../../lib/auth";
import { getPlay } from "../../../lib/engine/plays";

const ROLE_CLS: Record<string, string> = { owner: "acc", admin: "pos", member: "warn", viewer: "" };

function nameFromEmail(email: string): string {
  const handle = email.split("@")[0].replace(/[._-]+/g, " ");
  return handle.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function initials(email: string): string {
  const n = nameFromEmail(email).split(" ");
  return ((n[0]?.[0] ?? "") + (n[1]?.[0] ?? "")).toUpperCase() || (email[0] ?? "?").toUpperCase();
}

async function inviteMember(formData: FormData) {
  "use server";
  const store = await getCurrentStore();
  if (!store) redirect("/team");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member");
  if (!email) redirect("/team?error=Enter+an+email");
  const existing = await prisma.membership.findFirst({ where: { storeId: store.id, email } });
  if (existing) redirect("/team?notice=exists");
  await prisma.membership.create({ data: { userId: "", email, storeId: store.id, role } });
  redirect(`/team?notice=invited&email=${encodeURIComponent(email)}`);
}

async function removeMember(formData: FormData) {
  "use server";
  const store = await getCurrentStore();
  if (!store) redirect("/team");
  const id = String(formData.get("id") ?? "");
  const m = await prisma.membership.findFirst({ where: { id, storeId: store.id } });
  if (m && m.role !== "owner") await prisma.membership.delete({ where: { id } });
  redirect("/team");
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ notice?: string; email?: string; error?: string }> }) {
  const sp = await searchParams;
  const [store, user] = await Promise.all([getCurrentStore(), getCurrentUser()]);

  const [members, actions] = store ? await Promise.all([
    prisma.membership.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" } }),
    prisma.action.findMany({ where: { storeId: store.id }, orderBy: { exportedAt: "desc" }, take: 60, select: { playId: true, exportedAt: true } }),
  ]) : [[], []];

  // Group export Actions into activity events: one per (play, exportedAt).
  const eventMap = new Map<string, { playId: string; at: Date; count: number }>();
  for (const a of actions) {
    const key = `${a.playId}|${a.exportedAt.toISOString()}`;
    const e = eventMap.get(key) ?? { playId: a.playId, at: a.exportedAt, count: 0 };
    e.count++;
    eventMap.set(key, e);
  }
  const events = [...eventMap.values()].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 8);

  const PERMS = [
    { feature: "View dashboards & reports", owner: true, admin: true, member: true, viewer: true },
    { feature: "Export CSV segments", owner: true, admin: true, member: true, viewer: false },
    { feature: "Action recommendations", owner: true, admin: true, member: false, viewer: false },
    { feature: "Edit scoring thresholds", owner: true, admin: true, member: false, viewer: false },
    { feature: "Manage integrations", owner: true, admin: false, member: false, viewer: false },
    { feature: "Billing & plan", owner: true, admin: false, member: false, viewer: false },
    { feature: "Invite & remove members", owner: true, admin: false, member: false, viewer: false },
  ];

  return (
    <>
      <Topbar title="Team" sub={`${members.length} member${members.length === 1 ? "" : "s"}`} search="Search members…" />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-brand-shopify"></i>
          <div><strong>Live — team membership backed by Supabase auth. Invited members claim access via login.</strong></div>
        </div>
        <div className="page-head">
          <div>
            <h1 className="page-title">Team members</h1>
            <p className="page-sub">Manage who can access {store ? store.shopDomain : "your store"} in Altvary · all actions are tenant-scoped</p>
          </div>
          <div style={{ fontSize: "12.5px", color: "var(--muted)" }}>{members.length} member{members.length === 1 ? "" : "s"}</div>
        </div>

        {sp.notice === "invited" && <div className="note" style={{ marginBottom: 16, background: "var(--pos-soft)", borderColor: "transparent" }}><i className="ti ti-mail" style={{ color: "var(--pos)" }} /><div>Invited <strong>{sp.email}</strong> — they&apos;ll gain access when they log in with that email.</div></div>}
        {sp.notice === "exists" && <div className="note" style={{ marginBottom: 16, background: "var(--warn-soft)", borderColor: "transparent" }}><i className="ti ti-info-circle" style={{ color: "var(--warn)" }} /><div>That email is already on the team.</div></div>}
        {sp.error && <div className="note" style={{ marginBottom: 16, background: "var(--neg-soft)", borderColor: "transparent" }}><i className="ti ti-alert-triangle" style={{ color: "var(--neg)" }} /><div>{sp.error}</div></div>}

        {/* Member cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
          {members.map((m) => {
            const pending = m.userId === "";
            const isSelf = !!user && m.userId === user.id;
            return (
              <div key={m.id} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800, flexShrink: 0, background: "var(--card-2)", color: "var(--ink-2)" }}>{initials(m.email)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em" }}>{nameFromEmail(m.email)}{isSelf && <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}> · You</span>}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
                  </div>
                  <span className={`tag ${ROLE_CLS[m.role] ?? ""}`} style={{ flexShrink: 0, textTransform: "capitalize" }}>{m.role}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, color: pending ? "var(--warn)" : "var(--faint)" }}>{pending ? "Pending invite" : `Joined ${m.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}</span>
                  {m.role !== "owner" && (
                    <form action={removeMember}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="btn btn-ghost btn-sm" style={{ color: "var(--neg)" }}>Remove</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Invite form */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head"><div><div className="card-title">Invite a member</div><div className="card-sub">They gain access the moment they log in with this email (magic link or password)</div></div></div>
          <form action={inviteMember} className="card-pad" style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>
              Email address
              <input name="email" type="email" required placeholder="colleague@email.com" style={{ padding: "8px 11px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontFamily: "inherit", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none" }} />
            </label>
            <label style={{ width: 150, display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>
              Role
              <select name="role" defaultValue="member" style={{ padding: "8px 11px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", fontFamily: "inherit", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none" }}>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary btn-sm"><i className="ti ti-user-plus"></i> Send invite</button>
          </form>
        </div>

        {/* Permission matrix */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head"><div><div className="card-title">Permission matrix</div><div className="card-sub">What each role can do (enforcement rolls out post-MVP)</div></div></div>
          <div className="tbl-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Feature", "Owner", "Admin", "Member", "Viewer"].map((h, i) => (
                    <th key={i} style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", padding: "8px 14px", textAlign: i === 0 ? "left" : "center", borderBottom: "1px solid var(--line)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMS.map((p, i) => (
                  <tr key={i}>
                    <td style={{ padding: "9px 14px", borderBottom: i < PERMS.length - 1 ? "1px solid var(--line)" : "none", fontSize: "12.5px", color: "var(--ink-2)" }}>{p.feature}</td>
                    {[p.owner, p.admin, p.member, p.viewer].map((v, j) => (
                      <td key={j} style={{ padding: "9px 14px", borderBottom: i < PERMS.length - 1 ? "1px solid var(--line)" : "none", textAlign: "center" }}>
                        {v ? <i className="ti ti-check" style={{ color: "var(--pos)", fontSize: 16 }}></i> : <i className="ti ti-minus" style={{ color: "var(--faint)", fontSize: 14 }}></i>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity log — real export events */}
        <div className="card">
          <div className="card-head"><div><div className="card-title">Activity log</div><div className="card-sub">Recent export actions · tenant-scoped</div></div></div>
          <div style={{ padding: "0 20px 16px" }}>
            {events.length === 0 ? (
              <div style={{ padding: "22px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No activity yet — export a recommendation play to see it here.</div>
            ) : events.map((e, i) => {
              const play = getPlay(e.playId);
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", borderBottom: i < events.length - 1 ? "1px solid var(--line)" : "none", fontSize: "12.5px" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", fontSize: 13, flexShrink: 0, background: "var(--accent-soft)", color: "var(--accent-ink)" }}><i className="ti ti-file-export" /></div>
                  <div style={{ flex: 1, lineHeight: 1.5 }}><strong>{e.playId}{play ? ` — ${play.name}` : ""}</strong> exported · {e.count} customer{e.count === 1 ? "" : "s"}</div>
                  <span style={{ fontSize: 11, color: "var(--faint)", whiteSpace: "nowrap", flexShrink: 0 }}>{e.at.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
