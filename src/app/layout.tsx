import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

// Trailing slash so relative URLs like "og.png" resolve inside the repo path.
const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/?$/, "/");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tech News Briefing",
  description:
    "A tech-news briefing that groups Hacker News and mainstream coverage of the same story and ranks it by how many independent outlets covered it. Refreshed every 6 hours.",
  openGraph: {
    title: "Tech News Briefing",
    description: "The day's tech stories, grouped across Hacker News and mainstream outlets, ranked by independent coverage.",
    type: "website",
    // Static PNG (GitHub Pages serves extensionless files with the wrong type).
    images: [{ url: "og.png", width: 1200, height: 630, alt: "Tech News Briefing" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Tech News Briefing
          </Link>
          <nav>
            <Link href="/">Briefing</Link>
            <Link href="/about/">About</Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>
            Hacker News data via the{" "}
            <a href="https://hn.algolia.com/api" rel="noopener">
              Algolia HN Search API
            </a>
            . News data from{" "}
            <a href="https://currentsapi.services" rel="noopener">
              Currents API
            </a>
            {process.env.GRIDNEWS_ENABLED === "true" && (
              <>
                . Data from{" "}
                <a href="https://www.gridnews.io" rel="noopener">
                  GridNews
                </a>
              </>
            )}
            . Every headline links to its original publisher.
          </p>
        </footer>
      </body>
    </html>
  );
}
