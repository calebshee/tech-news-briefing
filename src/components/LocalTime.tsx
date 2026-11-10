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

const clock = (ts: number) => new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * The page is pre-rendered at build time, so the reader's timezone is only
 * known in the browser. The static HTML shows UTC until then.
 */
export function LocalTime({ ts, mode = "relative" }: { ts: number; mode?: "relative" | "clock" }) {
  const [local, setLocal] = useState<{ text: string; title: string } | null>(null);
  useEffect(() => {
    setLocal({ text: mode === "relative" ? relative(ts, Date.now()) : clock(ts), title: clock(ts) });
  }, [ts, mode]);
  const iso = new Date(ts).toISOString();
  const utc = iso.slice(0, 16).replace("T", " ") + " UTC";
  return (
    <time dateTime={iso} title={local?.title ?? utc}>
      {local?.text ?? utc}
    </time>
  );
}
