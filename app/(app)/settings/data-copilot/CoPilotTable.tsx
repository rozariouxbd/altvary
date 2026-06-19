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

type Tab = "review" | "confirmed";

export default function CoPilotTable(
  { reviewRows, confirmedRows, action }:
  { reviewRows: CoPilotRow[]; confirmedRows: CoPilotRow[]; action: (fd: FormData) => void },
) {
  const [review, setReview] = useState<CoPilotRow[]>(reviewRows);
  const [confirmed, setConfirmed] = useState<CoPilotRow[]>(confirmedRows);
  const [tab, setTab] = useState<Tab>(reviewRows.length ? "review" : "confirmed");
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const payloadRef = useRef<HTMLInputElement>(null);

  const rows = tab === "review" ? review : confirmed;
  const setRows = tab === "review" ? setReview : setConfirmed;
  const valid = (r: CoPilotRow) => r.volumeMl != null && !!r.category;

  function patch(id: string, p: Partial<CoPilotRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p, needsReview: false } : r)));
  }
  function submit(toSave: CoPilotRow[]) {
    if (!toSave.length || !payloadRef.current || !formRef.current) return;
    payloadRef.current.value = JSON.stringify(toSave);
    formRef.current.requestSubmit();
  }
  const approvable = review.filter(valid);

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button type="button" onClick={() => { setTab(id); setEditing(new Set()); }}
      style={{
        border: "none", background: "none", cursor: "pointer", padding: "10px 14px", fontSize: 13,
        fontWeight: tab === id ? 700 : 500, color: tab === id ? "var(--ink)" : "var(--muted)",
        borderBottom: `2px solid ${tab === id ? "var(--accent)" : "transparent"}`,
      }}>{label}</button>
  );

  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="payload" ref={payloadRef} />
      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            <TabBtn id="review" label={`Needs review (${review.length})`} />
            <TabBtn id="confirmed" label={`Confirmed (${confirmed.length})`} />
          </div>
          {tab === "review" && (
            <button type="button" className="btn btn-primary btn-sm" disabled={!approvable.length}
              onClick={() => submit(approvable)}>
              <i className="ti ti-circle-check" /> Approve all ({approvable.length})
            </button>
          )}
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>{tab === "review" ? "Raw text scanned" : "Status"}</th>
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
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
                      {tab === "review" ? (r.rawText || "—") : <span className="tag pos"><span className="dot pos"></span> confirmed</span>}
                    </td>
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
                        <td>{r.category ? <span className="tag acc">{r.category}</span> : <span className="tag warn">missing</span>}{r.routineStep ? <span style={{ fontSize: 11, color: "var(--faint)", marginLeft: 6 }}>{STEP_LABEL[r.routineStep]}</span> : null}</td>
                        <td style={{ fontSize: 12 }}>{r.ingredients.length ? r.ingredients.join(", ") : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                      </>
                    )}
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => setEditing((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}>
                        <i className="ti ti-pencil" /> {isEditing ? "Done" : "Edit"}
                      </button>{" "}
                      <button type="button" className="btn btn-primary btn-sm" disabled={!valid(r)} onClick={() => submit([r])}>
                        <i className="ti ti-check" /> {tab === "review" ? "Approve" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: "28px 0" }}>
                  {tab === "review" ? "Everything's reviewed — your product data is fully structured. 🎉" : "No confirmed products yet — approve some from the “Needs review” tab."}
                </td></tr>
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
