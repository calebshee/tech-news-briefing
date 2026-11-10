import type { Metadata } from "next";
import { activeSources } from "@/lib/briefing";
import { Credit } from "@/components/Credit";

export const metadata: Metadata = {
  title: "About · Tech News Briefing",
  description: "Where the stories come from, how they are grouped and ranked, and how often the briefing updates.",
};

export default function About() {
  const sources = activeSources();
  const keyed = sources.filter((s) => s.requiresKey);
  return (
    <main className="prose">
      <h1>About this briefing</h1>
      <p>
        Developers argue about a story on Hacker News hours before the press writes it up, and the two rarely sit side
        by side. This page puts them together: each card is one story, with every outlet that covered it.
      </p>

      <h2>Sources</h2>
      <p>
        {keyed.length === 0
          ? "Every source is free and needs no API key."
          : `Every source is free. All but ${keyed.map((s) => s.label).join(" and ")} need no API key.`}
      </p>
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
          Otherwise, headlines must share at least two meaningful words (or all of a very short headline’s words), and
          headlines and summaries are compared by the words they share. Rare names, products and version numbers count
          for more than names that appear all over the day’s news. Headlines that name different companies or products
          need much stronger agreement before they are grouped.
        </li>
        <li>No AI model is involved. Mistakes happen, mostly as two related stories left apart.</li>
      </ol>

      <h2>How stories are ranked</h2>
      <p>
        By <strong>independent voices</strong>:
      </p>
      <ul>
        <li>each press outlet that covered the story counts once, and copies run under the same headline count once;</li>
        <li>all community sharing (Hacker News, Kiwi News, Lobsters…) counts as one voice together;</li>
        <li>all vendor release notes and integration listings count as one voice together.</li>
      </ul>
      <p>
        Ties are broken by Hacker News points and comments. If fewer than ten stories have two or more voices, the list is
        topped up with the highest-scoring Hacker News posts, marked “HN only” or “Community only”. Everything else
        appears under each source’s “Also” column. “First seen on X, 6h before Y” compares the earliest article from
        each source in the group.
      </p>

      <h2>Updates</h2>
      <p>
        The page is rebuilt every 6 hours and covers a rolling 24-hour window. Nothing is kept between editions. Times
        are shown in your local timezone.
      </p>

      <h2>Attribution</h2>
      <p>
        Every headline links to its original publisher, except Techmeme summaries, which link to Techmeme because the
        feed doesn’t include the original article’s address.
      </p>
      <ul>
        {sources.map((s) => (
          <li key={s.id}>
            <Credit source={s} />
          </li>
        ))}
      </ul>
    </main>
  );
}
