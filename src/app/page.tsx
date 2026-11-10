import { buildBriefing, describeState } from "@/lib/briefing";
import { SOURCES, type SourceDef } from "@/lib/sources/registry";
import type { Cluster } from "@/lib/types";
import { ClusterCard } from "@/components/ClusterCard";
import { Dashboard, type Panel } from "@/components/Dashboard";
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

  const panels: Panel[] = [
    {
      id: "top",
      label: "Top stories",
      tabLabel: "Top stories",
      content:
        b.top.length === 0 ? (
          <p className="empty">No stories in the last {b.windowHours} hours.</p>
        ) : (
          <div className="stack">
            {b.top.map((c, i) => (
              <ClusterCard key={c.id} cluster={c} rank={i + 1} />
            ))}
          </div>
        ),
    },
    ...SOURCES.filter((s) => b.sourceStates[s.id].status === "ok").map((s) => ({
      id: s.id,
      label: s.columnTitle,
      tabLabel: s.tabLabel,
      content: <TrendingList clusters={b.alsoTrending[s.id]} empty={`Nothing else from ${s.label}.`} />,
    })),
  ];

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
      <Dashboard panels={panels} />
    </main>
  );
}
