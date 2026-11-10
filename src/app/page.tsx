import { buildBriefing, describeState } from "@/lib/briefing";
import { SOURCES, type SourceDef } from "@/lib/sources/registry";
import type { Cluster } from "@/lib/types";
import { ClusterCard } from "@/components/ClusterCard";
import { AlsoTabs, type AlsoPanel } from "@/components/AlsoTabs";
import { LocalTime } from "@/components/LocalTime";

const SIDE_LIMIT = 15;

function TrendingList({ clusters, empty }: { clusters: Cluster[]; empty: string }) {
  if (clusters.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="stack">
      {clusters.slice(0, SIDE_LIMIT).map((c) => (
        <ClusterCard key={c.id} cluster={c} compact />
      ))}
    </div>
  );
}

export default async function Page() {
  const b = await buildBriefing();
  const notices = SOURCES.map((s) => ({ s, reason: describeState(b.sourceStates[s.id]) })).filter(
    (n): n is { s: SourceDef; reason: string } => n.reason !== null,
  );

  const also: AlsoPanel[] = SOURCES.filter((s) => b.sourceStates[s.id].status === "ok").map((s) => ({
    id: s.id,
    title: s.columnTitle,
    tabLabel: s.tabLabel,
    count: Math.min(b.alsoTrending[s.id].length, SIDE_LIMIT),
    content: <TrendingList clusters={b.alsoTrending[s.id]} empty={`Nothing else from ${s.label}.`} />,
  }));

  return (
    <main>
      <div className="intro">
        <p>
          The last {b.windowHours} hours of tech news, grouped by story and ranked by how many independent outlets
          covered it. Updated <LocalTime ts={b.generatedAt} mode="clock" />; refreshed every 6 hours.
        </p>
        {b.usesSampleData && (
          <p className="notice warn">
            Development data: some entries come from synthetic samples with fake <code>.example</code> outlets.
          </p>
        )}
        {notices.map(({ s, reason }) => (
          <p key={s.id} className="notice">
            {s.label} isn’t included in this edition: {reason}.
          </p>
        ))}
      </div>
      <div className="dashboard">
        <section className="top-stories" aria-labelledby="top-heading">
          <h2 id="top-heading" className="panel-title">
            Top stories
          </h2>
          {b.top.length === 0 ? (
            <p className="empty">No stories in the last {b.windowHours} hours.</p>
          ) : (
            <div className="stack">
              {b.top.map((c, i) => (
                <ClusterCard key={c.id} cluster={c} rank={i + 1} />
              ))}
            </div>
          )}
        </section>
        <AlsoTabs panels={also} />
      </div>
    </main>
  );
}
