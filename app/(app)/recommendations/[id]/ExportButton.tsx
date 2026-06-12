"use client";
import { useState } from "react";

export default function ExportButton({ playId, count }: { playId: string; count: number }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onExport() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/plays/${playId}/export`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMsg(body.error ?? `Export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filename = cd.match(/filename="(.+?)"/)?.[1] ?? `${playId}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Exported ${count.toLocaleString()} contacts`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {msg && <span style={{ fontSize: 12, color: "var(--muted)" }}>{msg}</span>}
      <button className="btn btn-primary btn-sm" onClick={onExport} disabled={busy || count === 0}>
        <i className="ti ti-file-export"></i> {busy ? "Exporting…" : "Export CSV"}
      </button>
    </div>
  );
}
