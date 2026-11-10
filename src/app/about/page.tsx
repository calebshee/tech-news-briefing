import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About · Tech News Briefing",
  description: "Where the stories come from, how they are grouped and ranked, and how often the briefing updates.",
};

export default function About() {
  return (
    <main className="prose">
      <h1>About this briefing</h1>
      <p>
        Developers argue about a story on Hacker News hours before the mainstream press writes it up, and the two
        rarely sit side by side. This page puts them together: each card is one story, with every outlet that covered
        it.
      </p>

      <h2>Sources</h2>
      <ul>
        <li>
          <strong>Hacker News</strong>, via the Algolia HN Search API: stories from the last 24 hours with more than 20
          points. Hacker News counts as one outlet, the developer signal, however many times a story is posted.
        </li>
        <li>
          <strong>Currents API</strong>: English-language technology and business news from mainstream outlets.
        </li>
        <li>
          <strong>GridNews</strong> (when enabled): market news about technology companies, already grouped by story.
        </li>
      </ul>

      <h2>How stories are grouped</h2>
      <ol>
        <li>Articles that link to the same page are always the same story.</li>
        <li>
          Otherwise, headlines and summaries are compared by the words they share, weighted so rare words (names,
          products, version numbers) count far more than common ones. Headlines that name different companies or
          products need much stronger agreement before they are grouped.
        </li>
        <li>No AI model is involved. Mistakes happen, mostly as two related stories left apart.</li>
      </ol>

      <h2>How stories are ranked</h2>
      <p>
        By <strong>independent outlets</strong>: the number of distinct publishers that covered the story, counting
        wire copies run under the same headline as one. Ties are broken by Hacker News points and comments. If fewer
        than ten stories were covered by more than one outlet, the list is topped up with the highest-scoring Hacker
        News posts, marked “HN only”. Everything else appears under each source’s “Also” column.
      </p>
      <p>
        “First seen on Hacker News 6h before Currents” compares the earliest article from each source in the group.
      </p>

      <h2>Updates</h2>
      <p>
        The page is rebuilt every 6 hours and covers a rolling 24-hour window. Nothing is kept between editions. Times
        are shown in your local timezone.
      </p>

      <h2>Attribution</h2>
      <p>
        Every headline links to its original publisher. Data from the Algolia HN Search API, Currents API and, when
        enabled, GridNews.
      </p>
    </main>
  );
}
