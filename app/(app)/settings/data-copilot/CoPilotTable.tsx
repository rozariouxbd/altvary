"use client";
import { useState, useRef } from "react";

export interface CoPilotRow {
  id: string;
  productId: string;
  title: string;
  rawText: string;
  volumeMl?: number;
  category?: string;
  routineStep?: number;
  ingredients: string[];
  paoDays?: number;
  skinConcern?: string;
  needsReview: boolean;
}

const CATEGORIES = ["Cleanser", "Toner", "Serum", "Treatment", "Eye Cream", "Moisturizer", "Sunscreen", "Mask"];
const STEP_LABEL: Record<number, string> = { 1: "1 · Cleanse", 2: "2 · Treat", 3: "3 · Hydrate", 4: "4 · Protect" };
const STEP_FOR: Record<string, number> = {
  Cleanser: 1, Toner: 2, Serum: 2, Treatment: 2, "Eye Cream": 3, Moisturizer: 3, Sunscreen: 4, Mask: 2,
};

export default function CoPilotTable({ rows: initial, action }: { rows: CoPilotRow[]; action: (fd: FormData) => void }) {
  const [rows, setRows] = useState<CoPilotRow[]>(initial);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const payloadRef = useRef<HTMLInputElement>(null);

  const valid = (r: CoPilotRow) => r.volumeMl != null && !!r.category;

  function patch(id: string, p: Partial<CoPilotRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p, needsReview: false } : r)));
  }
  function submit(toApprove: CoPilotRow[]) {
    if (!toApprove.length || !payloadRef.current || !formRef.current) return;
    payloadRef.current.value = JSON.stringify(toApprove);
    formRef.current.requestSubmit();
  }

  const approvable = rows.filter(valid);

  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="payload" ref={payloadRef} />
      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="card-title">{rows.length} product{rows.length === 1 ? "" : "s"} to review</div>
            <div className="card-sub">We scanned your catalog and structured the beauty parameters — verify &amp; approve.</div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={!approvable.length}
            onClick={() => submit(approvable)}>
            <i className="ti ti-circle-check" /> Approve all ({approvable.length})
          </button>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>Raw text scanned</th>
                <th>Volume</th>
                <th>Routine step</th>
                <th>Key actives</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isEditing = editing.has(r.id);
                return (
                  <tr key={r.id}>
                    <td><div className="nm">{r.title}</div></td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{r.rawText || "—"}</td>
                    {isEditing ? (
                      <>
                        <td>
                          <input type="number" value={r.volumeMl ?? ""} placeholder="ml" min={0}
                            onChange={(e) => patch(r.id, { volumeMl: e.target.value ? Number(e.target.value) : undefined })}
                            style={inp(70)} /> ml
                        </td>
                        <td>
                          <select value={r.category ?? ""} onChange={(e) => patch(r.id, { category: e.target.value || undefined, routineStep: STEP_FOR[e.target.value] })} style={inp(130)}>
                            <option value="">— pick —</option>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td>
                          <input value={r.ingredients.join(", ")} placeholder="actives"
                            onChange={(e) => patch(r.id, { ingredients: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                            style={inp(160)} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{r.volumeMl != null ? <span style={{ fontFamily: "var(--mono)" }}>{r.volumeMl} ml</span> : <span className="tag warn">missing</span>}</td>
                        <td>{r.category ? <span className="tag acc">{STEP_LABEL[r.routineStep ?? 0] ? `${r.category}` : r.category}</span> : <span className="tag warn">missing</span>}{r.routineStep ? <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: 6 }}>{STEP_LABEL[r.routineStep]}</span> : null}</td>
                        <td style={{ fontSize: 12 }}>{r.ingredients.length ? r.ingredients.join(", ") : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                      </>
                    )}
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => setEditing((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}>
                        <i className="ti ti-pencil" /> {isEditing ? "Done" : "Edit"}
                      </button>{" "}
                      <button type="button" className="btn btn-primary btn-sm" disabled={!valid(r)} onClick={() => submit([r])}>
                        <i className="ti ti-check" /> Approve
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: "28px 0" }}>Everything&apos;s reviewed — your product data is fully structured. 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </form>
  );
}

const inp = (w: number): React.CSSProperties => ({
  width: w, border: "1px solid var(--line)", borderRadius: "var(--r-xs)", background: "var(--bg)",
  padding: "5px 8px", fontSize: 12, color: "var(--ink)", fontFamily: "var(--mono)", outline: "none",
});
