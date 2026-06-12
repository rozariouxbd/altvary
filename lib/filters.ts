/** Shared filter helpers for the data pages. */

export type RangeKey = "30d" | "90d" | "12m" | "all";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];

const DAY = 86_400_000;

/** Normalize an arbitrary query value to a RangeKey (default "all"). */
export function asRange(v: string | undefined): RangeKey {
  return v === "30d" || v === "90d" || v === "12m" ? v : "all";
}

/** Earliest `createdAt` to include for a range, or undefined for "all". */
export function rangeSince(range: RangeKey): Date | undefined {
  switch (range) {
    case "30d": return new Date(Date.now() - 30 * DAY);
    case "90d": return new Date(Date.now() - 90 * DAY);
    case "12m": return new Date(Date.now() - 365 * DAY);
    default: return undefined;
  }
}

export function rangeLabel(range: RangeKey): string {
  return RANGE_OPTIONS.find((r) => r.key === range)?.label ?? "All time";
}
