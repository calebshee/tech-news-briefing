"use client";

import { useEffect, useState } from "react";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function relative(ts: number, now: number): string {
  const mins = Math.round((ts - now) / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 48) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

/**
 * The page is pre-rendered at build time, so times are formatted in the
 * reader's timezone only once it reaches the browser. Until then, UTC.
 */
export function LocalTime({ ts, mode = "relative" }: { ts: number; mode?: "relative" | "clock" }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(
      mode === "relative"
        ? relative(ts, Date.now())
        : new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    );
  }, [ts, mode]);
  const iso = new Date(ts).toISOString();
  return (
    <time dateTime={iso} title={new Date(ts).toUTCString()} suppressHydrationWarning>
      {text ?? iso.slice(0, 16).replace("T", " ") + " UTC"}
    </time>
  );
}
