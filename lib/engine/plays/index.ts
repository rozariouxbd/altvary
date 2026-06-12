import type { PlayDefinition } from "../types";
import { R02 } from "./r02";
import { R04 } from "./r04";
import { R05 } from "./r05";
import { R07 } from "./r07";
import { R08 } from "./r08";

/**
 * The play registry. Plays are defined in code (one file each) and listed here.
 * All five below run on the current schema (RFME + orders). Plays needing product,
 * return, or integration data are added once those models land.
 */
export const REGISTRY: PlayDefinition[] = [R02, R04, R05, R07, R08];

export const PLAYS_BY_ID: Record<string, PlayDefinition> = Object.fromEntries(
  REGISTRY.map((p) => [p.id.toLowerCase(), p])
);

/** Look up a play by id/code, case-insensitive (e.g. "r02", "R02"). */
export function getPlay(id: string): PlayDefinition | undefined {
  return PLAYS_BY_ID[id.toLowerCase()];
}
