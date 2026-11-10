"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface Panel {
  id: string;
  /** Column heading on desktop. */
  label: string;
  /** Short name on the mobile tab. */
  tabLabel: string;
  content: ReactNode;
}

/**
 * Desktop: every panel visible as a column (CSS grid).
 * Below tablet width: one panel at a time, picked with tabs.
 * Without JavaScript the tabs stay hidden and panels simply stack.
 */
export function Dashboard({ panels }: { panels: Panel[] }) {
  const [active, setActive] = useState(panels[0]?.id);
  // Only switch to tabs once JavaScript runs; the static HTML stacks panels.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div className="dashboard" data-tabs-ready={ready ? "true" : undefined}>
      <div className="tabs" role="tablist" aria-label="Sections">
        {panels.map((p) => (
          <button
            key={p.id}
            role="tab"
            id={`tab-${p.id}`}
            aria-selected={active === p.id}
            aria-controls={`panel-${p.id}`}
            onClick={() => setActive(p.id)}
          >
            {p.tabLabel}
          </button>
        ))}
      </div>
      {panels.map((p) => (
        <section
          key={p.id}
          id={`panel-${p.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${p.id}`}
          className={`panel panel-${p.id}${active === p.id ? " active" : ""}`}
        >
          <h2 className="panel-title">{p.label}</h2>
          {p.content}
        </section>
      ))}
    </div>
  );
}
