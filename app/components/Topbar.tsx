"use client";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";

interface TopbarCta {
  icon: string;
  label: string;
  variant?: "ghost" | "primary";
  /** If set, the CTA renders as a download link to this URL instead of a plain button. */
  href?: string;
}

interface TopbarProps {
  title: string;
  sub?: string;
  search?: string;
  cta?: TopbarCta;
  crumb?: { href: string; label: string };
}

const RECENT_NOTIFS = [
  { id: 1, cls: "score",  icon: "ti-chart-bar-off", title: "VIP score drop — Sophie Johnson",  sub: "E score: 72 → 54 in 7 days — export to Klaviyo now.",       time: "02:04", unread: true },
  { id: 2, cls: "inv",    icon: "ti-package",        title: "Low stock — Vitamin C Serum 20%", sub: "14 units left · 134 customers in replenishment window.",          time: "02:04", unread: true },
  { id: 3, cls: "rec",    icon: "ti-alert-triangle", title: "2 plays need attention",               sub: "R06 template missing · R10 discount code expired.",               time: "02:04", unread: true },
  { id: 4, cls: "report", icon: "ti-file-analytics", title: "Weekly report ready — Jun 2–8", sub: "$4,820 revenue influenced · 22% week-over-week.",             time: "07:14", unread: false },
  { id: 5, cls: "system", icon: "ti-clock",          title: "Trial started",                        sub: "Growth plan · 14 days free. Upgrade before Jun 23.",              time: "Jun 9", unread: false },
];

export default function Topbar({ title, sub, search = "Search…", cta, crumb }: TopbarProps) {
  const [open, setOpen] = useState(false);
  const [reads, setReads] = useState<Set<number>>(new Set());
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unreadCount = RECENT_NOTIFS.filter(n => n.unread && !reads.has(n.id)).length;

  function markAllRead(e: React.MouseEvent) {
    e.preventDefault();
    setReads(new Set(RECENT_NOTIFS.map(n => n.id)));
  }

  return (
    <header className="top">
      {crumb ? (
        <div className="crumb">
          <a href={crumb.href}><i className="ti ti-arrow-left" style={{ verticalAlign: -2 }} /> {crumb.label}</a>
          <span className="sep">/</span>
          <span className="cur">{title}</span>
        </div>
      ) : (
        <div className="top-h">
          <div className="t">{title}</div>
          {sub && <div className="s">{sub}</div>}
        </div>
      )}
      <button
        className="hamburger"
        onClick={() => (document.querySelector(".rx") as HTMLElement | null)?.classList.toggle("nav-open")}
        aria-label="Menu"
      >
        <i className="ti ti-menu-2" />
      </button>
      <div
        className="nav-overlay"
        onClick={() => (document.querySelector(".rx") as HTMLElement | null)?.classList.remove("nav-open")}
      />
      <form className="search" action="/search" method="get">
        <i className="ti ti-search" />
        <input name="q" placeholder={search} autoComplete="off" onMouseDown={(e) => { e.preventDefault(); window.dispatchEvent(new Event("cmdk-open")); }} />
        <kbd style={{ fontSize: 10, color: "var(--faint)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px", marginLeft: "auto" }}>⌘K</kbd>
      </form>
      <div className="top-actions">
        <div className="notif-anchor" ref={bellRef}>
          <button
            className={`icon-btn bell-badge${unreadCount > 0 ? "" : " bell-clear"}`}
            data-count={unreadCount > 0 ? unreadCount : undefined}
            aria-label="Notifications"
            onClick={() => setOpen(v => !v)}
          >
            <i className="ti ti-bell" />
          </button>
          {open && (
            <div className="notif-drop">
              <div className="notif-drop-head">
                <span className="notif-drop-title">Notifications</span>
                {unreadCount > 0 && (
                  <button className="notif-mark-all" onClick={markAllRead}>Mark all read</button>
                )}
              </div>
              <div className="notif-drop-list">
                {RECENT_NOTIFS.map(n => {
                  const isUnread = n.unread && !reads.has(n.id);
                  return (
                    <Link key={n.id} href="/notifications" className={`notif-drop-item${isUnread ? " unread" : ""}`} onClick={() => setOpen(false)}>
                      {isUnread && <span className="notif-dot" />}
                      <div className={`notif-ic-sm ${n.cls}`}><i className={`ti ${n.icon}`} /></div>
                      <div className="notif-drop-body">
                        <div className="notif-drop-item-title">{n.title}</div>
                        <div className="notif-drop-item-sub">{n.sub}</div>
                        <div className="notif-drop-item-time">{n.time}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <Link href="/notifications" className="notif-drop-footer" onClick={() => setOpen(false)}>
                View all notifications
              </Link>
            </div>
          )}
        </div>
        {cta && (
          cta.href ? (
            <a href={cta.href} className={`btn btn-sm ${cta.variant === "primary" ? "btn-primary" : "btn-ghost"}`}>
              <i className={`ti ${cta.icon}`} /> {cta.label}
            </a>
          ) : (
            <button className={`btn btn-sm ${cta.variant === "primary" ? "btn-primary" : "btn-ghost"}`}>
              <i className={`ti ${cta.icon}`} /> {cta.label}
            </button>
          )
        )}
      </div>
    </header>
  );
}
