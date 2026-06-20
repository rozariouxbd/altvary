import type { Customer } from "@prisma/client";
import { formatMoney } from "../money";
import type { CustomerSignal } from "./types";

/**
 * The per-play "why this customer" context line, drawn from order/score signals — the human-readable
 * reason a customer surfaced for a play. Shared by the recommendations detail page and the Decision
 * Layer (lib/engine/decisions.ts) so both render one consistent explanation. Returns "—" when the
 * signal isn't available.
 */
export function signalText(playId: string, c: Customer, s: CustomerSignal | undefined, currency: string): string {
  switch (playId) {
    case "R02": return s ? `${s.daysSinceLastOrder}d dormant` : "—";
    case "R04":
      return s?.scoreDrop7d != null ? `score ↓${s.scoreDrop7d} (was ${s.prevScore7d})` : "—";
    case "R05":
      return s?.cycleDays != null ? `${s.cycleDays}d cycle · ${s.daysSinceLastOrder}d since` : "—";
    case "R06": {
      const d = c.daysToDepletion;
      if (d == null) return "—";
      return d < 0 ? `overdue ${-d}d` : d === 0 ? "due today" : `${d}d left`;
    }
    case "R09": return c.routineGap ? `missing ${c.routineGap}` : "—";
    case "R10": {
      const d = c.daysToFreshness;
      if (d == null) return "—";
      return d < 0 ? `expired ${-d}d` : d === 0 ? "expires today" : `${d}d to expiry`;
    }
    case "R11":
      return c.marginDropPct != null
        ? `margin ↓${c.marginDropPct}pp${c.recentMarginPct != null ? ` (now ${c.recentMarginPct}%)` : ""}`
        : "—";
    case "R12": {
      if (!c.introHoldUntil) return "—";
      const d = Math.max(0, Math.ceil((c.introHoldUntil.getTime() - Date.now()) / 86_400_000));
      return `${d}d left in intro`;
    }
    case "R13": return c.householdFlag ? "multiple skin profiles" : "—";
    case "R23": return c.lapsedActive ? `dropped ${c.lapsedActive}` : "—";
    case "R28": return c.routineLapsed ? "whole routine lapsed" : "—";
    case "R07": return `1st order ${formatMoney(c.totalSpent, currency)}`;
    case "R08": return `${c.orderCount} orders · ${formatMoney(c.totalSpent, currency)} LTV`;
    default: return "—";
  }
}
