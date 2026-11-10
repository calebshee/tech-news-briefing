import { buildBriefing } from "@/lib/briefing";
import { SOURCE_LABEL, type Cluster, type SourceId } from "@/lib/types";
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
  const notices = (Object.keys(b.sourceStates) as SourceId[])
    .map((s) => ({ s, st: b.sourceStates[s] }))
    .filter(({ st }) => st.status !== "ok");

  const panels: Panel[] = [
    {
      id: "top",
      label: "Top stories",
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
    {
      id: "hn",
      label: "Also on Hacker News",
      content: <TrendingList clusters={b.alsoTrending.hn} empty="Nothing else trending on Hacker News." />,
    },
  ];
  if (b.sourceStates.currents.status === "ok") {
    panels.push({
      id: "currents",
      label: "Also in the news",
      content: <TrendingList clusters={b.alsoTrending.currents} empty="No other single-outlet stories." />,
    });
  }
  if (b.sourceStates.gridnews.status === "ok") {
    panels.push({
      id: "gridnews",
      label: "Markets",
      content: <TrendingList clusters={b.alsoTrending.gridnews} empty="No other tech-company market stories." />,
    });
  }

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
        {notices.map(({ s, st }) => (
          <p key={s} className="notice">
            {SOURCE_LABEL[s]} isn’t included in this edition:{" "}
            {st.status === "error" ? `the request failed (${st.message})` : st.status === "disabled" ? st.reason : ""}.
          </p>
        ))}
      </div>
      <Dashboard panels={panels} />
    </main>
  );
}
