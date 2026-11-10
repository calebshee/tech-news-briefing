/**
 * Captures a real 24h snapshot from each API into ./fixtures so development
 * and threshold tuning never spend live quota.
 *
 *   npm run fixtures:refresh
 *
 * Reads keys from .env.local. Sources without a key are skipped and keep
 * using their synthetic *.sample.json file.
 */
import { writeFileSync } from "node:fs";
import { WINDOW_HOURS } from "../src/lib/briefing";
import { fetchHn } from "../src/lib/sources/hn";
import { fetchCurrents } from "../src/lib/sources/currents";
import { fetchGridnews } from "../src/lib/sources/gridnews";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: only keyless sources are refreshed.
}

const now = Date.now();
const save = (name: string, data: unknown) => {
  writeFileSync(`fixtures/${name}.json`, JSON.stringify(data, null, 2) + "\n");
  console.log(`saved fixtures/${name}.json`);
};

async function main() {
  save("hn", await fetchHn(now, WINDOW_HOURS));

  const currentsKey = process.env.CURRENTS_API_KEY;
  if (currentsKey) save("currents", await fetchCurrents(currentsKey, now, WINDOW_HOURS));
  else console.log("skipped Currents: no CURRENTS_API_KEY");

  const gridKey = process.env.GRIDNEWS_API_KEY;
  if (gridKey) save("gridnews", await fetchGridnews(gridKey, WINDOW_HOURS));
  else console.log("skipped GridNews: no GRIDNEWS_API_KEY");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
