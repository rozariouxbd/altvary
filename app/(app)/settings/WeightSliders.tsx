"use client";
import { useState } from "react";

type Points = { wR: number; wF: number; wM: number; wE: number };

const DIMS: { key: keyof Points; dim: string; label: string; hint: string }[] = [
  { key: "wR", dim: "R", label: "Recency", hint: "How recently they ordered" },
  { key: "wF", dim: "F", label: "Frequency", hint: "How often they order" },
  { key: "wM", dim: "M", label: "Monetary", hint: "How much they spend" },
  { key: "wE", dim: "E", label: "Engagement", hint: "Recent order activity" },
];

const DEFAULTS: Points = { wR: 35, wF: 25, wM: 25, wE: 15 };

/**
 * RFME weight sliders. Merchants drag raw points per axis; the engine normalizes
 * them to sum to 1, so the meaningful number is each axis's *share* — shown live
 * as a percentage. Submits to the `updateWeights` server action.
 */
export default function WeightSliders({
  initial,
  action,
}: {
  initial: Points;
  action: (formData: FormData) => void;
}) {
  const [v, setV] = useState<Points>(initial);
  const sum = v.wR + v.wF + v.wM + v.wE;
  const pct = (n: number) => (sum > 0 ? Math.round((n / sum) * 100) : 0);
  const dirty = (Object.keys(v) as (keyof Points)[]).some((k) => v[k] !== initial[k]);

  return (
    <form action={action}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {DIMS.map((d) => (
          <div key={d.key}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ fontSize: "12.5px", color: "var(--ink-2)" }}>
                <b>{d.dim}</b> · {d.label}
                <span style={{ color: "var(--faint)", marginLeft: 6, fontSize: 11 }}>{d.hint}</span>
              </span>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13 }}>{pct(v[d.key])}%</span>
            </div>
            <input
              type="range"
              name={d.key}
              min={0}
              max={100}
              step={1}
              value={v[d.key]}
              onChange={(e) => setV({ ...v, [d.key]: Number(e.target.value) })}
              style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }}
            />
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 12, lineHeight: 1.5 }}>
        Shares are normalized to total 100% — tune relative emphasis, the numbers don&apos;t
        need to add up themselves. New weights apply on the next scoring run (or hit
        <b> Recompute now</b> above).
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!dirty || sum === 0}>
          <i className="ti ti-device-floppy" /> Save weights
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setV(DEFAULTS)}
          disabled={v.wR === DEFAULTS.wR && v.wF === DEFAULTS.wF && v.wM === DEFAULTS.wM && v.wE === DEFAULTS.wE}
        >
          <i className="ti ti-rotate" /> Reset to default
        </button>
      </div>
    </form>
  );
}
