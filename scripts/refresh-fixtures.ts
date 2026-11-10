/**
 * Captures a real 24h snapshot from every source into ./fixtures so
 * development and threshold tuning never spend live quota.
 *
 *   npm run fixtures:refresh
 *
 * Reads keys from .env.local. A source that needs a key it doesn't have is
 * skipped and keeps using its synthetic *.sample.json file.
 */
import { writeFileSync } from "node:fs";
import { WINDOW_HOURS } from "../src/lib/briefing";
import { SOURCES } from "../src/lib/sources/registry";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: only keyless sources are refreshed.
}

async function main() {
  const now = Date.now();
  let failed = false;
  for (const s of SOURCES) {
    // Fixtures are for development, so feature flags don't apply; keys do.
    const skip = s.skipLive?.({ ...process.env, GRIDNEWS_ENABLED: "true" });
    if (skip) {
      console.log(`skipped ${s.label}: ${skip.status === "disabled" ? skip.reason : skip.status}`);
      continue;
    }
    try {
      const raw = await s.fetch(now, WINDOW_HOURS, process.env);
      writeFileSync(`fixtures/${s.fixture}.json`, JSON.stringify(raw, null, 2) + "\n");
      console.log(`saved fixtures/${s.fixture}.json (${s.parse(raw).length} articles)`);
    } catch (e) {
      failed = true;
      console.error(`failed ${s.label}: ${(e as Error).message}`);
    }
  }
  if (failed) process.exit(1);
}

main();
