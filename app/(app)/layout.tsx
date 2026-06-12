import "../components/shell.css";
import Sidebar from "../components/Sidebar";
import CommandPalette from "../components/CommandPalette";
import { prisma } from "../../lib/prisma";
import { REGISTRY } from "../../lib/engine/plays";
import { getCurrentStore, getCurrentUser } from "../../lib/auth";

function prettyStoreName(domain: string): string {
  return domain
    .replace(/\.myshopify\.com$/, "")
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [store, user] = await Promise.all([getCurrentStore(), getCurrentUser()]);
  const customerCount = store ? await prisma.customer.count({ where: { storeId: store.id } }) : 0;

  const storeName = store ? prettyStoreName(store.shopDomain) : "No store connected";
  const trialDaysLeft = store
    ? Math.max(0, Math.ceil((store.trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : 0;

  return (
    <div className="rx">
      <Sidebar
        customerCount={customerCount}
        playCount={REGISTRY.length}
        storeName={storeName}
        trialDaysLeft={trialDaysLeft}
        userEmail={user?.email ?? null}
      />
      <div className="main">{children}</div>
      <CommandPalette />
    </div>
  );
}
