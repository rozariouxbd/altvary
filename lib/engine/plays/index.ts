import type { PlayDefinition } from "../types";
import { R02 } from "./r02";
import { R04 } from "./r04";
import { R05 } from "./r05";
import { R06 } from "./r06";
import { R07 } from "./r07";
import { R08 } from "./r08";
import { R09 } from "./r09";

/** Skincare-vertical features ship behind a flag (off by default) until rolled out. */
const SKINCARE_FEATURES = process.env.SKINCARE_FEATURES_ENABLED === "true";

/**
 * The play registry. Plays are defined in code (one file each) and listed here.
 * The core five run on RFME + orders. The skincare plays (R06 exhaustion, R09 routine
 * gap) need line-item + product metadata and are gated behind SKINCARE_FEATURES_ENABLED.
 */
export const REGISTRY: PlayDefinition[] = [
  R02, R04, R05, R07, R08,
  ...(SKINCARE_FEATURES ? [R06, R09] : []),
];

export const PLAYS_BY_ID: Record<string, PlayDefinition> = Object.fromEntries(
  REGISTRY.map((p) => [p.id.toLowerCase(), p])
);

/** Look up a play by id/code, case-insensitive (e.g. "r02", "R02"). */
export function getPlay(id: string): PlayDefinition | undefined {
  return PLAYS_BY_ID[id.toLowerCase()];
}
