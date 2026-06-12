import type { Store } from "@prisma/client";
import { createClient } from "./supabase/server";
import { prisma } from "./prisma";

/** True when Supabase auth is configured (env present). */
export function authEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/** The current Supabase auth user, or null. */
export async function getCurrentUser() {
  if (!authEnabled()) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Resolve the store for the current session.
 * - If auth is off (local dev), fall back to the single store.
 * - If a membership exists, return its store.
 * - Otherwise auto-claim: link this user to the existing store (first user = owner).
 */
export async function getCurrentStore(): Promise<Store | null> {
  if (!authEnabled()) {
    return prisma.store.findFirst();
  }

  const user = await getCurrentUser();
  if (!user) return null;
  const email = user.email?.toLowerCase() ?? "";

  // 1. Already a member.
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { store: true },
  });
  if (membership) return membership.store;

  // 2. A pending membership for this email (created at install) — claim it.
  const pending = await prisma.membership.findFirst({
    where: { email, userId: "" },
    include: { store: true },
  });
  if (pending) {
    await prisma.membership.update({ where: { id: pending.id }, data: { userId: user.id } }).catch(() => {});
    return pending.store;
  }

  // 3. Dev fallback: single store, no memberships yet → claim as owner.
  const stores = await prisma.store.findMany({ take: 2 });
  if (stores.length === 1) {
    const existing = await prisma.membership.count({ where: { storeId: stores[0].id } });
    await prisma.membership.create({
      data: { userId: user.id, email, storeId: stores[0].id, role: existing === 0 ? "owner" : "member" },
    }).catch(() => {});
    return stores[0];
  }

  // 4. Multiple stores and no membership → no access (must be invited / install).
  return null;
}
