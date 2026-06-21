import Topbar from "../../components/Topbar";
import KnowledgeBase from "./KnowledgeBase";

export const metadata = { title: "Knowledgebase — Altvary" };

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <Topbar title="Knowledgebase" sub="How to use Altvary · Klaviyo · the engine" search="Search help…" />
      <main className="page">
        <div className="note note-acc" style={{ marginBottom: 16 }}>
          <i className="ti ti-book" />
          <div><strong>Everything you need to run Altvary.</strong> Setup, the daily decision workflow, connecting Klaviyo and building one flow, how scoring &amp; the play engine work, plus troubleshooting. Search or browse by topic.</div>
        </div>

        <div className="page-head">
          <div>
            <h1 className="page-title">Knowledgebase</h1>
            <p className="page-sub">Guides for every part of the app — pick a topic on the left.</p>
          </div>
        </div>

        <KnowledgeBase initial={sp.a} />
      </main>
    </>
  );
}
