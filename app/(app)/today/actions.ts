"use server";

import { redirect } from "next/navigation";
import { getCurrentStore } from "../../../lib/auth";
import { regenerateCopy, type CopyContext } from "../../../lib/engine/copy";
import { markDecisionsSent } from "../../../lib/engine/export";

/**
 * Regenerate the AI copy for a single decision (the card "reroll" control).
 * Auth-gated; returns the new message, or null if generative copy is off / generation failed
 * (the client then keeps the current copy).
 */
export async function regenerateMessage(ctx: CopyContext): Promise<string | null> {
  const store = await getCurrentStore();
  if (!store) return null;
  return regenerateCopy(ctx).catch(() => null);
}

/** Deploy a single decision to Klaviyo (used by the customer-page "Today's decision" panel). */
export interface DeployInput {
  customerId: string; email: string; playId: string; playName: string;
  message: string; offer: string | null; product: string | null; productId: string | null;
  expectedRevenue: number; confidence: number;
  returnTo: string; // where to send the user after deploy
}
export async function deployDecision(input: DeployInput): Promise<void> {
  const store = await getCurrentStore();
  if (!store) redirect("/today");
  const { returnTo, ...row } = input;
  await markDecisionsSent(store, [row]).catch(() => {});
  redirect(`${returnTo}?notice=sent`);
}
