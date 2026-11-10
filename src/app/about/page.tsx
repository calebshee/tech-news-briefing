import type { Metadata } from "next";
import { activeSources } from "@/lib/briefing";

export const metadata: Metadata = {
  title: "About · Tech News Briefing",
  description: "Where the stories come from, how they are grouped and ranked, and how often the briefing updates.",
};

export default function About() {
  const sources = activeSources();
  return (
    <main className="prose">
      <h1>About this briefing</h1>
      <p>
        Developers argue about a story on Hacker News hours before the press writes it up, and the two rarely sit side
        by side. This page puts them together: each card is one story, with every outlet that covered it.
      </p>

      <h2>Sources</h2>
      <p>Every source is free and needs no API key.</p>
      <ul>
        {sources.map((s) => (
          <li key={s.id}>
            <strong>{s.label}</strong>: {s.about}
          </li>
        ))}
      </ul>

      <h2>How stories are grouped</h2>
      <ol>
        <li>Articles that link to the same page are always the same story.</li>
        <li>
          Otherwise, headlines must share at least two meaningful words, and headlines and summaries are compared by
          the words they share. Rare names, products and version numbers count for more than names that appear all
          over the day’s news. Headlines that name different companies or products need much stronger agreement
          before they are grouped.
        </li>
        <li>No AI model is involved. Mistakes happen, mostly as two related stories left apart.</li>
      </ol>

      <h2>How stories are ranked</h2>
      <p>
        By <strong>independent outlets</strong>: the number of distinct publishers that covered the story, counting
        copies run under the same headline as one. Community sites (Hacker News, Kiwi News) count as one outlet each.
        Ties are broken by Hacker News points and comments. If fewer than ten stories were covered by more than one
        outlet, the list is topped up with the highest-scoring Hacker News posts, marked “HN only”. Everything else
        appears under each source’s “Also” column.
      </p>
      <p>“First seen on X, 6h before Y” compares the earliest article from each source in the group.</p>

      <h2>Updates</h2>
      <p>
        The page is rebuilt every 6 hours and covers a rolling 24-hour window. Nothing is kept between editions. Times
        are shown in your local timezone.
      </p>

      <h2>Attribution</h2>
      <p>Every headline links to its original publisher.</p>
      <ul>
        {sources.map((s) => (
          <li key={s.id}>
            <a href={s.attribution.url} rel="noopener">
              {s.attribution.name}
            </a>
            {s.attribution.license && <>, licensed {s.attribution.license}</>}
          </li>
        ))}
      </ul>
    </main>
  );
}
