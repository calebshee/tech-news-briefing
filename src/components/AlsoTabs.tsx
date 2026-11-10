"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface AlsoPanel {
  id: string;
  /** Heading inside the panel, e.g. "Also on Hacker News". */
  title: string;
  /** Short tab name, e.g. "HN". */
  tabLabel: string;
  /** Number of stories, shown on the tab. */
  count: number;
  content: ReactNode;
}

/**
 * The "Also on / Also in" lists, one tab per source.
 * Without JavaScript the tabs stay hidden and every list simply stacks.
 */
export function AlsoTabs({ panels }: { panels: AlsoPanel[] }) {
  const [active, setActive] = useState(panels[0]?.id);
  // Only switch to tabs once JavaScript runs; the static HTML stacks the lists.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Left/Right (and Home/End) move between tabs, as the ARIA tabs pattern expects.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = panels.findIndex((p) => p.id === active);
    const next =
      e.key === "ArrowRight" ? (i + 1) % panels.length
      : e.key === "ArrowLeft" ? (i - 1 + panels.length) % panels.length
      : e.key === "Home" ? 0
      : e.key === "End" ? panels.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(panels[next].id);
    tabRefs.current[panels[next].id]?.focus();
  }

  if (panels.length === 0) return null;
  return (
    <section className="also" aria-labelledby="also-heading" data-tabs-ready={ready ? "true" : undefined}>
      <h2 id="also-heading" className="panel-title">
        Also trending
      </h2>
      <div className="tabs" role="tablist" aria-label="Also trending by source" onKeyDown={onKeyDown}>
        {panels.map((p) => (
          <button
            key={p.id}
            ref={(el) => {
              tabRefs.current[p.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${p.id}`}
            aria-selected={active === p.id}
            aria-controls={`panel-${p.id}`}
            tabIndex={active === p.id ? 0 : -1}
            onClick={() => setActive(p.id)}
          >
            {p.tabLabel} <span className="tab-count">{p.count}</span>
          </button>
        ))}
      </div>
      {panels.map((p) => (
        <div
          key={p.id}
          id={`panel-${p.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${p.id}`}
          tabIndex={0}
          className={`also-panel${active === p.id ? " active" : ""}`}
        >
          <h3 className="also-title">{p.title}</h3>
          {p.content}
        </div>
      ))}
    </section>
  );
}
