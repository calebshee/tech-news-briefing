import type { Cluster } from "@/lib/types";
import { SOURCE_LABEL } from "@/lib/types";
import { LocalTime } from "./LocalTime";

function leadText(c: Cluster): string | null {
  if (!c.lead) return null;
  const first = SOURCE_LABEL[c.firstSeen.source];
  const next = SOURCE_LABEL[c.lead.nextSource];
  if (c.lead.hours < 1) return `${first} and ${next} within the hour`;
  return `${first} ${c.lead.hours}h before ${next}`;
}

export function ClusterCard({ cluster: c, rank, compact = false }: { cluster: Cluster; rank?: number; compact?: boolean }) {
  const outlets = [...new Set(c.articles.map((a) => a.outlet))];
  const lead = leadText(c);
  return (
    <article className={`card${compact ? " compact" : ""}`}>
      <div className="card-head">
        {rank !== undefined && <span className="rank">{rank}</span>}
        <h3>
          <a href={c.headlineUrl} rel="noopener" target="_blank">
            {c.headline}
          </a>
        </h3>
      </div>

      <p className="meta">
        {c.fill ? (
          <span className="badge muted">HN only</span>
        ) : (
          <span className="badge strong" title="Distinct outlets, with wire reprints counted once">
            {c.coverage} independent outlet{c.coverage === 1 ? "" : "s"}
          </span>
        )}
        {c.sources.map((s) => (
          <span key={s} className={`badge src-${s}`}>
            {SOURCE_LABEL[s]}
          </span>
        ))}
        <span className="first-seen">
          First seen on {c.firstSeen.source === "hn" ? "Hacker News" : c.firstSeen.outlet}{" "}
          <LocalTime ts={c.firstSeen.at} />
          {lead && <> · {lead}</>}
        </span>
      </p>

      {c.hn && (
        <p className="hn-line">
          <a href={c.hn.discussionUrl} rel="noopener" target="_blank">
            ▲ {c.hn.points} points · {c.hn.comments} comments on Hacker News
          </a>
        </p>
      )}

      {c.articles.length > 1 && (
        <details>
          <summary>
            {c.articles.length} articles from {outlets.length} outlet{outlets.length === 1 ? "" : "s"}
          </summary>
          <ul className="articles">
            {c.articles.map((a) => (
              <li key={a.id}>
                <a href={a.url} rel="noopener" target="_blank">
                  {a.title}
                </a>
                <span className="outlet">
                  {a.outlet} · <LocalTime ts={a.publishedAt} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
