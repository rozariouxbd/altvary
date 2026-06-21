"use client";
import { useMemo, useState } from "react";

/* ---------- inline primitives (match the design system: mono code, quiet chips) ---------- */
function Code({ children }: { children: React.ReactNode }) {
  return <code style={{ fontFamily: "var(--mono)", fontSize: 12, background: "var(--card-2)", padding: "1px 5px", borderRadius: 4 }}>{children}</code>;
}
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: "var(--accent-soft, var(--card-2))", color: "var(--accent-ink)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)" }}>{n}</span>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)", flex: 1 }}>{children}</div>
    </div>
  );
}
function Note({ kind = "acc", children }: { kind?: "acc" | "warn" | "pos"; children: React.ReactNode }) {
  const cls = kind === "acc" ? "note note-acc" : "note";
  const icon = kind === "warn" ? "ti-alert-triangle" : kind === "pos" ? "ti-check" : "ti-info-circle";
  const color = kind === "warn" ? "var(--warn, var(--clay))" : kind === "pos" ? "var(--pos)" : undefined;
  return (
    <div className={cls} style={{ margin: "14px 0" }}>
      <i className={`ti ${icon}`} style={{ color }} />
      <div>{children}</div>
    </div>
  );
}
function H({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.01em", margin: "22px 0 10px" }}>{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-2)", margin: "0 0 12px" }}>{children}</p>;
}

/* ---------- article catalog ---------- */
interface Article {
  id: string;
  category: string;
  icon: string;
  title: string;
  summary: string;
  keywords: string;
  body: React.ReactNode;
}

const CATEGORIES = [
  { id: "Getting started", icon: "ti-rocket" },
  { id: "Daily workflow", icon: "ti-target" },
  { id: "Klaviyo", icon: "ti-mail" },
  { id: "The engine", icon: "ti-sparkles" },
  { id: "Data & scoring", icon: "ti-database" },
  { id: "Troubleshooting", icon: "ti-lifebuoy" },
];

const ARTICLES: Article[] = [
  /* ---------------- Getting started ---------------- */
  {
    id: "what-is-altvary",
    category: "Getting started",
    icon: "ti-bulb",
    title: "What is Altvary?",
    summary: "The unified AI retention decision engine for skincare & beauty merchants.",
    keywords: "overview intro decision engine retention churn what is",
    body: (
      <>
        <P>Altvary turns your Shopify history into <strong>one revenue decision per customer, per day</strong>. Instead of juggling 30+ separate segment lists, you get a single ranked queue on <strong>Today</strong>: who to reach, why, which product to recommend, what offer to attach, on which channel, and the revenue at stake.</P>
        <P>It runs as three layers:</P>
        <Step n={1}><strong>Signals & scoring</strong> — every order, refund, product and customer is scored (RFME, lifecycle segment, replenishment timing, skin-routine signals).</Step>
        <Step n={2}><strong>The decision engine</strong> — 30+ retention plays evaluate every customer; a waterfall picks the single best action so customers never get conflicting messages.</Step>
        <Step n={3}><strong>Outcome intelligence</strong> — once a decision is sent, Altvary watches real Shopify purchases and attributes recovered revenue back to the play.</Step>
        <Note kind="acc">Altvary is <strong>prediction & decisioning</strong>, not a sender. It decides and explains; Klaviyo (or CSV) delivers the message. See <em>Klaviyo → How Send works</em>.</Note>
      </>
    ),
  },
  {
    id: "first-week",
    category: "Getting started",
    icon: "ti-checklist",
    title: "Your first week — setup checklist",
    summary: "Connect Shopify, sync, score, connect Klaviyo, send your first decisions.",
    keywords: "setup onboarding checklist start connect first steps",
    body: (
      <>
        <Step n={1}><strong>Connect Shopify</strong> on <Code>Integrations</Code>. Orders, customers and products import automatically; GDPR webhooks register on connect.</Step>
        <Step n={2}><strong>Sync</strong> — use “Sync from Shopify” (top-right of Today) any time you want the latest orders.</Step>
        <Step n={3}><strong>Confirm your product data</strong> in <Code>Settings → Product data</Code> (the Co-Pilot). Sizes, units and categories sharpen replenishment timing.</Step>
        <Step n={4}><strong>Let scoring run.</strong> The first run scores every customer (RFME, segments, signals). It also runs nightly and after each sync.</Step>
        <Step n={5}><strong>Connect Klaviyo</strong> in <Code>Settings → Integrations</Code> (paste a private API key). Optional, but it’s how decisions get delivered.</Step>
        <Step n={6}><strong>Send your first decisions</strong> from <Code>Today</Code>, then build one Klaviyo flow (see the Klaviyo section).</Step>
        <Note kind="pos">After this, your day is just: open <strong>Today</strong> → review the queue → <strong>Send</strong>. Everything else runs in the background.</Note>
      </>
    ),
  },
  {
    id: "navigation",
    category: "Getting started",
    icon: "ti-map",
    title: "Finding your way around",
    summary: "What each screen in the sidebar is for.",
    keywords: "navigation sidebar menu pages screens overview tour",
    body: (
      <>
        <H>Workspace</H>
        <P><strong>Today</strong> — your daily decision queue (start here). <strong>Overview</strong> — store-wide KPIs and trends. <strong>Intelligence</strong> — the full play catalog and what each is surfacing. <strong>Customers</strong> — searchable customer records. <strong>RFME Scores</strong> — the score distribution.</P>
        <H>Decisions</H>
        <P><strong>Winback</strong>, <strong>Inventory</strong>, <strong>Returns</strong> and <strong>Attribution</strong> are focused views into specific play families and the data behind them.</P>
        <H>System</H>
        <P><strong>Integrations</strong> (Shopify/Klaviyo), <strong>Billing</strong>, <strong>Reports</strong> (snapshots, decision performance, CSV exports), <strong>Team</strong>, and <strong>Settings</strong>.</P>
      </>
    ),
  },

  /* ---------------- Daily workflow ---------------- */
  {
    id: "today-screen",
    category: "Daily workflow",
    icon: "ti-target",
    title: "Reading the Today queue",
    summary: "One decision per customer — Who, Why, Product, Offer, Channel, Expected revenue, Confidence.",
    keywords: "today queue decisions columns who why product offer channel send",
    body: (
      <>
        <P>Today is the heart of Altvary: one ranked row per customer, sorted by <strong>expected revenue × confidence</strong>. Each column answers one question:</P>
        <P><strong>Who</strong> — the customer and their lifecycle segment. <strong>Why</strong> — the play that fired and the plain-English reason. <strong>Product</strong> — the recommended SKU. <strong>Offer</strong> — a discount code if the play attaches one (otherwise “full price”). <strong>Channel</strong> — where to deliver. <strong>Expected rev</strong> — 30-day influenced revenue if it converts. <strong>Confidence</strong> — how sure the engine is.</P>
        <H>Sending</H>
        <P>Use <strong>Send</strong> on a row, or <strong>Send all</strong> in the card header. Sent decisions leave the queue and move into outcome tracking; they reappear in <Code>Reports → Performance</Code> once customers purchase.</P>
        <Note kind="acc">The three KPI tiles at the top sum the queue: total expected revenue, number of opportunities, and average confidence.</Note>
      </>
    ),
  },
  {
    id: "confidence",
    category: "Daily workflow",
    icon: "ti-gauge",
    title: "How confidence works",
    summary: "Explainable scores; “provisional” until a play has enough outcomes to calibrate.",
    keywords: "confidence provisional calibrated explainable factors score",
    body: (
      <>
        <P>Confidence estimates how likely a decision is to convert. <strong>Click any confidence score</strong> to expand the factors that produced it (recency, value, signal strength, etc.) with their individual contributions.</P>
        <H>Provisional vs. calibrated</H>
        <P>A play shows <strong>provisional</strong> until it has accumulated enough real outcomes (≈30 sent decisions) to calibrate its predictions against actual purchases. Once calibrated, you’ll see a numeric score. Provisional decisions are still worth sending — the engine just hasn’t earned the right to a precise number yet.</P>
        <Note kind="warn">Confidence and expected revenue are <strong>estimates</strong>. Expected revenue is 30-day last-touch <em>influenced</em> revenue, not proven causation — see <em>Reports → outcome intelligence</em>.</Note>
      </>
    ),
  },
  {
    id: "one-decision",
    category: "Daily workflow",
    icon: "ti-arrows-join",
    title: "Why only one decision per customer?",
    summary: "The priority waterfall prevents conflicting messages.",
    keywords: "waterfall priority arbitration one decision dedupe conflict suppression",
    body: (
      <>
        <P>A customer can match several plays at once — replenishment due, lapsing, and a winback candidate all at the same time. Sending all three would spam them and dilute results.</P>
        <P>Altvary runs a <strong>priority waterfall</strong>: safety holds first (e.g. a recent irritation/return suppresses promotional sends), then the highest-value applicable play wins. The result is the single <Code>activePlay</Code> you see on Today.</P>
        <Note kind="acc">Suppressions matter for trust: customers who returned a product or flagged a reaction are held back from promos automatically.</Note>
      </>
    ),
  },

  /* ---------------- Klaviyo ---------------- */
  {
    id: "klaviyo-connect",
    category: "Klaviyo",
    icon: "ti-plug",
    title: "Connecting Klaviyo",
    summary: "Paste a private API key in Settings → Integrations.",
    keywords: "klaviyo connect api key private integration setup",
    body: (
      <>
        <Step n={1}>In Klaviyo: <strong>Settings → API keys → Create Private API Key</strong>. Give it full access to Profiles and Events (or read/write profiles + events).</Step>
        <Step n={2}>In Altvary: <Code>Settings → Integrations</Code>, paste the key, save.</Step>
        <Step n={3}>On the next sync/score, Altvary appends <Code>altvary_rfme_score</Code>, <Code>altvary_lifecycle_tier</Code> and the skincare signal properties to matching profiles.</Step>
        <Note kind="acc">Altvary writes to Klaviyo, it never reads your subscribers or sends email itself. Delivery always happens inside a Klaviyo flow you control.</Note>
      </>
    ),
  },
  {
    id: "klaviyo-send",
    category: "Klaviyo",
    icon: "ti-send",
    title: "What happens when you click Send",
    summary: "Profile properties + a tracked event + a local outcome record — all at once.",
    keywords: "send klaviyo what happens profile properties event sync outcome action",
    body: (
      <>
        <P>Each <strong>Send</strong> on Today does three things in parallel (all best-effort — Klaviyo problems never block the send):</P>
        <Step n={1}><strong>Profile properties</strong> — it writes the decision copy onto each customer’s Klaviyo profile: <Code>altvary_active_play</Code>, <Code>altvary_play_name</Code>, <Code>altvary_message</Code>, <Code>altvary_offer</Code>, <Code>altvary_product</Code>.</Step>
        <Step n={2}><strong>A tracked event</strong> — it fires an <Code>Altvary Decision Sent</Code> event with properties <Code>play</Code>, <Code>play_name</Code>, <Code>product</Code>, <Code>offer</Code>, <Code>expected_revenue</Code>, <Code>confidence</Code>, and <Code>value</Code> = expected revenue.</Step>
        <Step n={3}><strong>A local outcome record</strong> — it logs the decision (predicted revenue, confidence, recommended SKU, attribution window) so <Code>Reports → Performance</Code> can measure conversions later.</Step>
        <P>You then build <strong>one</strong> Klaviyo flow that reads either the profile properties or the event — and it covers <em>every</em> play, because the merge fields carry the per-customer copy.</P>
      </>
    ),
  },
  {
    id: "klaviyo-one-flow",
    category: "Klaviyo",
    icon: "ti-route",
    title: "Do I need a flow per play?",
    summary: "No — one merge-field flow delivers all 30+ plays.",
    keywords: "flow per play one flow merge fields how many flows reuse",
    body: (
      <>
        <P><strong>No.</strong> That’s the point of pushing the copy onto the profile/event. You build a single flow whose email pulls its subject, body, product and offer from the Altvary merge fields. Whichever play fired, the right copy renders.</P>
        <P>If you later want play-specific design (e.g. a distinct template for winback vs. replenishment), you can add <strong>conditional splits</strong> inside that one flow on <Code>altvary_active_play</Code> / <Code>event.play</Code> — still one flow.</P>
      </>
    ),
  },
  {
    id: "klaviyo-build-flow",
    category: "Klaviyo",
    icon: "ti-hierarchy",
    title: "Building the Klaviyo flow (step by step)",
    summary: "Segment trigger (works now) vs. event trigger (re-fires every send).",
    keywords: "build flow trigger segment event metric merge tags create klaviyo recipe",
    body: (
      <>
        <P>You have two trigger options. Pick one flow.</P>
        <H>Option A — Segment trigger (simplest, works immediately)</H>
        <Step n={1}>In Klaviyo, create a segment: condition <Code>altvary_active_play</Code> <em>is set</em>. This populates as soon as you’ve sent decisions.</Step>
        <Step n={2}><strong>Flows → Create → Build your own</strong>. Trigger: <strong>“When someone is added to a segment”</strong> → pick that segment. (In the trigger picker this is under <strong>All triggers</strong>, not the Recommended tab.)</Step>
        <Step n={3}>Add an <strong>Email</strong>. Merge the copy with profile tags: <Code>{"{{ person.altvary_message }}"}</Code>, <Code>{"{{ person.altvary_product }}"}</Code>, <Code>{"{{ person.altvary_offer }}"}</Code>.</Step>
        <Note kind="warn">A segment trigger fires only on the <em>first</em> entry. If a customer is re-surfaced later it won’t re-trigger — use Option B for repeat sends.</Note>
        <H>Option B — Event trigger (recommended; re-fires every send)</H>
        <Step n={1}>Fire the event once so Klaviyo knows it exists: click <strong>Send</strong> on any Today decision. The <Code>Altvary Decision Sent</Code> metric then appears in Klaviyo.</Step>
        <Step n={2}><strong>Flows → Create → Build your own</strong>. Trigger: <strong>“When someone does”</strong> → metric <Code>Altvary Decision Sent</Code> (under the <strong>Your metrics</strong> tab).</Step>
        <Step n={3}>Add an <strong>Email</strong>. Merge with event tags: <Code>{"{{ event.product }}"}</Code>, <Code>{"{{ event.offer }}"}</Code>, <Code>{"{{ event.play_name }}"}</Code> — or use the profile tags from Option A.</Step>
        <Note kind="pos">Keep the flow in <strong>Draft</strong> while testing with sample/sim data so you don’t email test profiles. Switch to <strong>Live</strong> when ready, with Smart Sending on.</Note>
      </>
    ),
  },
  {
    id: "klaviyo-merge-tags",
    category: "Klaviyo",
    icon: "ti-tags",
    title: "Altvary merge tags & properties reference",
    summary: "Every property and event field you can merge into an email.",
    keywords: "merge tags properties reference altvary_ fields event person variables",
    body: (
      <>
        <H>Profile properties (use {"{{ person.* }}"})</H>
        <P>
          <Code>altvary_active_play</Code> · <Code>altvary_play_name</Code> · <Code>altvary_message</Code> · <Code>altvary_offer</Code> · <Code>altvary_product</Code><br />
          <Code>altvary_rfme_score</Code> · <Code>altvary_lifecycle_tier</Code><br />
          Skincare signals: <Code>altvary_buyer_persona</Code> · <Code>altvary_skin_type_loyal</Code> · <Code>altvary_routine_lapsed</Code> · <Code>altvary_reaction_risk</Code> · <Code>altvary_lapsed_active</Code> · <Code>altvary_acquisition_source</Code> · <Code>altvary_advocate</Code> · <Code>altvary_seasonal_shift</Code> · <Code>altvary_bundle_lapsed</Code>
        </P>
        <H>Event fields (use {"{{ event.* }}"} on Altvary Decision Sent)</H>
        <P><Code>play</Code> · <Code>play_name</Code> · <Code>product</Code> · <Code>offer</Code> · <Code>expected_revenue</Code> · <Code>confidence</Code> · <Code>value</Code></P>
        <Note kind="acc">Tip: add a fallback so an email never renders blank, e.g. <Code>{"{{ person.altvary_offer|default:'' }}"}</Code>.</Note>
      </>
    ),
  },
  {
    id: "klaviyo-csv",
    category: "Klaviyo",
    icon: "ti-file-spreadsheet",
    title: "No Klaviyo? Use CSV export",
    summary: "Every list and play can be exported as CSV.",
    keywords: "csv export no klaviyo manual download alternative",
    body: (
      <>
        <P>Klaviyo is optional. From <Code>Reports → Exports</Code> (or any list’s download button) you can export customers + scores, the recommendation queue, returns, attribution and inventory as CSV, then import into whatever ESP or ad platform you use.</P>
        <Note kind="warn">Exports are rate-limited (a handful per hour) to keep the data pipeline healthy.</Note>
      </>
    ),
  },

  /* ---------------- The engine ---------------- */
  {
    id: "plays-overview",
    category: "The engine",
    icon: "ti-sparkles",
    title: "The play catalog",
    summary: "30+ retention plays — replenishment, winback, VIP, skincare-specific.",
    keywords: "plays catalog recommendations intelligence R01 R32 list engine",
    body: (
      <>
        <P>A <strong>play</strong> is a rule + model that finds customers in a specific revenue situation and proposes an action. See them all under <Code>Intelligence</Code>. Broad families:</P>
        <P><strong>Replenishment</strong> — predict when a consumable runs out and prompt a reorder. <strong>Winback</strong> — re-engage lapsed high-value customers. <strong>VIP / loyalty</strong> — protect and grow your best customers. <strong>At-risk / churn</strong> — intervene before a customer goes quiet.</P>
        <H>Skincare-specific plays (the moat)</H>
        <P>Active-ingredient dropout, routine lapses, reaction/irritation safety holds, seasonal routine shifts, bundle re-completion, reformulation watch, persona-based recommendations, and creator/acquisition-source LTV. These use beauty-specific product metadata (size, unit, PAO, ingredients, shade) that generic retention tools don’t model.</P>
        <Note kind="acc">Each play page shows its current candidates, the logic in plain English, and an expected-lift estimate.</Note>
      </>
    ),
  },
  {
    id: "outcome-intelligence",
    category: "The engine",
    icon: "ti-chart-arrows-vertical",
    title: "Outcome intelligence & attribution",
    summary: "Sent → Converted/Expired, measured from real Shopify purchases.",
    keywords: "outcome attribution converted expired influenced revenue performance honesty",
    body: (
      <>
        <P>Every sent decision becomes a tracked outcome with a lifecycle: <strong>Pending → Exported (sent) → Converted</strong> (the customer purchased within the window) <strong>or → Expired</strong> (no purchase in time).</P>
        <P>Attribution is <strong>30-day last-touch “influenced” revenue</strong>: if a customer who received a decision purchases within 30 days, that order’s value is credited to the play. Gifts are excluded.</P>
        <Note kind="warn"><strong>Influenced ≠ proven.</strong> Last-touch attribution can’t prove the decision <em>caused</em> the purchase. True incremental lift (holdout / product-matched) is the planned next step before any performance-based billing.</Note>
        <P>See it all in <Code>Reports → Performance</Code>: per play — sent, converted, recovery rate, revenue per decision, and influenced revenue.</P>
      </>
    ),
  },
  {
    id: "winback-importance",
    category: "The engine",
    icon: "ti-heart-handshake",
    title: "Winback — why it matters",
    summary: "Recovering a lapsed customer is far cheaper than acquiring a new one.",
    keywords: "winback lapsed importance retention reactivation churn value",
    body: (
      <>
        <P>Re-engaging a customer you already acquired costs a fraction of finding a new one, and lapsed buyers already know your products — so winback is usually the highest-ROI retention lever you have.</P>
        <P>Altvary’s winback play targets high-value customers who’ve gone quiet but haven’t fully churned, and pairs them with a relevant product + offer. The <Code>Winback</Code> screen shows the current candidates and the spend/recency thresholds behind them.</P>
        <Note kind="acc">If Winback shows zero candidates, it’s usually a threshold mismatch — see <em>Troubleshooting → Winback shows 0 candidates</em>.</Note>
      </>
    ),
  },

  /* ---------------- Data & scoring ---------------- */
  {
    id: "rfme",
    category: "Data & scoring",
    icon: "ti-chart-histogram",
    title: "RFME scores & segments",
    summary: "Recency, Frequency, Monetary, Engagement → one score and a lifecycle segment.",
    keywords: "rfme score recency frequency monetary engagement segment vip at risk churning",
    body: (
      <>
        <P>Every customer gets an <strong>RFME</strong> score from four sub-scores:</P>
        <P><strong>R</strong>ecency — how recently they bought. <strong>F</strong>requency — how often. <strong>M</strong>onetary — how much. <strong>E</strong>ngagement — breadth/consistency of behavior.</P>
        <P>The composite score maps to a lifecycle segment: <strong>VIP, Returning, At risk, Churning, Lost</strong>. Segments feed both the decision engine and your Klaviyo profile sync (<Code>altvary_lifecycle_tier</Code>). View the distribution under <Code>RFME Scores</Code>.</P>
        <Note kind="acc">All figures use a monospace font with tabular numbers so columns line up and are easy to scan.</Note>
      </>
    ),
  },
  {
    id: "sync-scoring",
    category: "Data & scoring",
    icon: "ti-refresh",
    title: "Syncing & scoring",
    summary: "When data refreshes and how scoring runs.",
    keywords: "sync scoring run nightly schedule refresh shopify cron update",
    body: (
      <>
        <P><strong>Sync</strong> pulls the latest orders, customers and products from Shopify. Trigger it any time with “Sync from Shopify” on Today, and live webhooks keep new orders flowing in continuously.</P>
        <P><strong>Scoring</strong> recomputes RFME, segments and all play signals. It runs nightly and after meaningful syncs. The first run on a fresh store scores your entire history and can take a few minutes.</P>
        <Note kind="warn">If scoring seems stuck, an old run lock can block new runs. It clears automatically; see <em>Troubleshooting</em>.</Note>
      </>
    ),
  },
  {
    id: "product-copilot",
    category: "Data & scoring",
    icon: "ti-flask",
    title: "Product data Co-Pilot",
    summary: "Confirm size, unit, category, PAO & shade to sharpen timing.",
    keywords: "product data copilot metadata size unit pao shade category confirm settings",
    body: (
      <>
        <P>Replenishment timing is only as good as your product metadata. The <strong>Co-Pilot</strong> (<Code>Settings → Product data</Code>) infers size, unit (ml/oz/g/pcs), category, period-after-opening (PAO) and makeup shade for each SKU, and lets you confirm or correct them.</P>
        <P>Confirmed products power native-unit depletion math — e.g. a 60-piece capsule pack vs. a 30 ml serum deplete on completely different clocks. The <strong>Confirmed</strong> tab and the Settings audit show your coverage.</P>
        <Note kind="acc">More confirmed metadata → tighter replenishment windows → better-timed decisions on Today.</Note>
      </>
    ),
  },
  {
    id: "privacy",
    category: "Data & scoring",
    icon: "ti-shield-lock",
    title: "Data isolation & privacy",
    summary: "Each merchant’s data lives in an isolated tenant silo; GDPR webhooks built in.",
    keywords: "privacy gdpr data isolation tenant security compliance webhooks",
    body: (
      <>
        <P>All data is tenant-scoped: your store’s orders, customers and scores never touch another merchant’s pipeline. Shopify’s GDPR/compliance webhooks (customer redact, shop redact, data request) are registered automatically on connect.</P>
        <P>When data is redacted, the corresponding Klaviyo properties Altvary wrote are also reset.</P>
      </>
    ),
  },

  /* ---------------- Troubleshooting ---------------- */
  {
    id: "tb-winback-zero",
    category: "Troubleshooting",
    icon: "ti-zoom-question",
    title: "Winback shows 0 candidates",
    summary: "Usually a segment/threshold mismatch, not a bug.",
    keywords: "winback zero empty no candidates troubleshoot threshold segment",
    body: (
      <>
        <P>If Winback is empty, the most common cause is overlapping filters that can’t both be true — for example a spend floor that pushes high-spenders into a “returning” segment, while the play also required an “at-risk/churning” segment. The fix is to relax the conflicting gate so spend and lifecycle don’t cancel each other out.</P>
        <P>Also check: scoring has run at least once, and there’s enough order history for customers to actually lapse.</P>
        <Note kind="acc">After a config change, run scoring (or sync) so the candidate lists rebuild.</Note>
      </>
    ),
  },
  {
    id: "tb-confidence-provisional",
    category: "Troubleshooting",
    icon: "ti-help-hexagon",
    title: "Everything says “provisional”",
    summary: "Expected — the play hasn’t collected enough outcomes yet.",
    keywords: "provisional confidence calibrate not enough outcomes new store",
    body: (
      <>
        <P>“Provisional” is normal for a new store or a newly active play. Confidence calibrates only after roughly 30 sent decisions for that play have had time to convert or expire. Keep sending; the numbers sharpen as outcomes accumulate in <Code>Reports → Performance</Code>.</P>
      </>
    ),
  },
  {
    id: "tb-scoring-stuck",
    category: "Troubleshooting",
    icon: "ti-clock-pause",
    title: "Scoring looks stuck / queue is empty",
    summary: "Stale run lock or a sync that hasn’t completed.",
    keywords: "scoring stuck stale lock empty queue no decisions run failed",
    body: (
      <>
        <P>The Today queue is empty until at least one scoring run completes. If a run was interrupted, a stale lock can briefly block the next one — it’s released automatically and the next nightly/sync run proceeds.</P>
        <Step n={1}>Confirm Shopify shows as <strong>Connected</strong> on Integrations.</Step>
        <Step n={2}>Run <strong>Sync from Shopify</strong> from Today and wait for it to finish.</Step>
        <Step n={3}>Check <Code>Integrations</Code> for the “Last scored” time — if it’s recent, the queue should populate.</Step>
      </>
    ),
  },
  {
    id: "tb-klaviyo-metric-missing",
    category: "Troubleshooting",
    icon: "ti-mail-question",
    title: "“Altvary Decision Sent” isn’t in Klaviyo",
    summary: "The metric only appears after the first event fires.",
    keywords: "klaviyo metric missing event not showing trigger your metrics decision sent",
    body: (
      <>
        <P>Klaviyo only lists a custom metric once it has received it at least once. Click <strong>Send</strong> on any Today decision, wait ~30 seconds, then refresh the Klaviyo trigger picker and look under the <strong>Your metrics</strong> tab.</P>
        <P>Still missing? Re-check your Klaviyo API key in <Code>Settings → Integrations</Code> (it needs event write access), and make sure the customer has an email that exists as a Klaviyo profile.</P>
      </>
    ),
  },
];

/* ---------- component ---------- */
export default function KnowledgeBase({ initial }: { initial?: string }) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string>(
    ARTICLES.some((a) => a.id === initial) ? initial! : ARTICLES[0].id,
  );

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return ARTICLES;
    return ARTICLES.filter((a) =>
      (a.title + " " + a.summary + " " + a.keywords + " " + a.category).toLowerCase().includes(q),
    );
  }, [q]);

  const active = ARTICLES.find((a) => a.id === activeId) ?? ARTICLES[0];
  const byCat = CATEGORIES.map((c) => ({ ...c, items: matches.filter((a) => a.category === c.id) })).filter((c) => c.items.length);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18, alignItems: "start" }} className="kb-grid">
      {/* nav rail */}
      <div className="card" style={{ padding: 12, position: "sticky", top: 16 }}>
        <div className="search" style={{ marginBottom: 10 }}>
          <i className="ti ti-search" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the knowledgebase…" autoComplete="off" />
        </div>
        {byCat.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "10px 8px" }}>No articles match “{query}”.</div>
        ) : byCat.map((c) => (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--muted)", padding: "6px 8px", display: "flex", alignItems: "center", gap: 6 }}>
              <i className={`ti ${c.icon}`} /> {c.id}
            </div>
            {c.items.map((a) => (
              <button
                key={a.id}
                onClick={() => setActiveId(a.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                  border: "none", cursor: "pointer", borderRadius: 8, padding: "7px 8px", fontSize: 13,
                  background: a.id === activeId ? "var(--card-2)" : "transparent",
                  color: a.id === activeId ? "var(--ink)" : "var(--ink-2)",
                  fontWeight: a.id === activeId ? 600 : 400,
                }}
              >
                <i className={`ti ${a.icon}`} style={{ fontSize: 15, color: "var(--muted)", flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* article */}
      <div className="card" style={{ padding: "24px 28px", minHeight: 400 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--accent-ink)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
          <i className={`ti ${active.icon}`} /> {active.category}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 6px" }}>{active.title}</h1>
        <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>{active.summary}</p>
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>{active.body}</div>

        <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 12.5, color: "var(--muted)" }}>
          Still stuck? Reach the team from <a href="/team" style={{ color: "var(--accent-ink)" }}>Team</a> or check your connections on <a href="/integrations" style={{ color: "var(--accent-ink)" }}>Integrations</a>.
        </div>
      </div>
    </div>
  );
}
