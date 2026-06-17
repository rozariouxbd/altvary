"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  customerCount: number;
  playCount: number;
  storeName: string;
  trialDaysLeft: number;
  userEmail?: string | null;
}

export default function Sidebar({ customerCount, playCount, storeName, trialDaysLeft, userEmail }: SidebarProps) {
  const pathname = usePathname();

  const nav = {
    Workspace: [
      { href: "/dashboard",       icon: "ti-layout-dashboard",  label: "Dashboard",        count: "" },
      { href: "/recommendations", icon: "ti-sparkles",          label: "Recommendations",  count: String(playCount) },
      { href: "/customers",       icon: "ti-users",             label: "Customers",        count: customerCount.toLocaleString() },
      { href: "/scores",          icon: "ti-chart-histogram",   label: "RFME Scores",      count: "" },
    ],
    Decisions: [
      { href: "/winback",     icon: "ti-heart-handshake", label: "Winback",     count: "" },
      { href: "/inventory",   icon: "ti-box",             label: "Inventory",   count: "" },
      { href: "/returns",     icon: "ti-rotate",          label: "Returns",     count: "" },
      { href: "/attribution", icon: "ti-arrows-split",    label: "Attribution", count: "" },
    ],
    System: [
      { href: "/integrations", icon: "ti-plug",              label: "Integrations", count: "" },
      { href: "/billing",      icon: "ti-credit-card",       label: "Billing",      count: "" },
      { href: "/reports",      icon: "ti-report-analytics",  label: "Reports",      count: "" },
      { href: "/team",         icon: "ti-users-group",       label: "Team",         count: "" },
      { href: "/settings",     icon: "ti-settings",          label: "Settings",     count: "" },
    ],
  };

  return (
    <aside className="side">
      <div className="brand">
        <span className="brand-mark"><img src="/brand/Altvary_Icon_white.png" alt="" width={20} height={20} /></span>
        <div className="brand-text">
          <span className="brand-name">Alt<b>vary</b></span>
          <span className="brand-store">{storeName}</span>
        </div>
      </div>

      <nav className="nav">
        {Object.entries(nav).map(([section, items]) => (
          <div key={section}>
            <div className="nav-sec">{section}</div>
            {items.map(({ href, icon, label, count }) => (
              <Link
                key={href}
                href={href}
                className={pathname === href || (href !== "/" && pathname.startsWith(href)) ? "on" : ""}
              >
                <i className={`ti ${icon}`} />
                {" "}{label}
                {count ? <span className="count">{count}</span> : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <span className="pfp">{(userEmail?.[0] ?? "A").toUpperCase()}</span>
        <div style={{ minWidth: 0 }}>
          <div className="nm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userEmail ?? "Local dev"}</div>
          <div className="pl">Growth trial · {trialDaysLeft}d left</div>
        </div>
        {userEmail ? (
          <a href="/api/auth/signout" title="Sign out" style={{ color: "var(--muted)", display: "grid", placeItems: "center" }}><i className="ti ti-logout" /></a>
        ) : (
          <i className="ti ti-dots" />
        )}
      </div>
    </aside>
  );
}
