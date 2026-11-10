/**
 * Captures a real 24h snapshot from every source into ./fixtures so
 * development and threshold tuning never spend live quota.
 *
 *   npm run fixtures:refresh
 *
 * All-or-nothing: every source is fetched first, and files are written only
 * if all of them succeed, so the snapshots always share one capture time.
 * A source that needs a key it doesn't have (from .env.local) is skipped
 * and keeps its existing fixture or synthetic *.sample.json file.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { FIXTURES_DIR, FIXTURES_META, WINDOW_HOURS } from "../src/lib/briefing";
import { liveSkipReason, SOURCES } from "../src/lib/sources/registry";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: only keyless sources are refreshed.
}

async function main() {
  const now = Date.now();
  const toWrite: { file: string; raw: unknown; count: number }[] = [];
  const failures: string[] = [];

  for (const s of SOURCES) {
    // Development data ignores feature flags but still needs keys.
    const skip = liveSkipReason(s, process.env, false);
    if (skip) {
      console.log(`skipped ${s.label}: ${skip.status === "disabled" ? skip.reason : skip.status}`);
      continue;
    }
    try {
      const raw = await s.fetch(now, WINDOW_HOURS, process.env);
      toWrite.push({ file: path.join(FIXTURES_DIR, `${s.fixture}.json`), raw, count: s.parse(raw).length });
    } catch (e) {
      failures.push(`${s.label}: ${(e as Error).message}`);
    }
  }

  if (failures.length) {
    console.error(`Nothing written; these sources failed:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  for (const { file, raw, count } of toWrite) {
    writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
    console.log(`saved ${path.relative(process.cwd(), file)} (${count} articles)`);
  }
  writeFileSync(FIXTURES_META, JSON.stringify({ capturedAt: new Date(now).toISOString() }, null, 2) + "\n");
}

main();
