/**
 * Free, dependency-less text similarity for headline matching:
 * TF-IDF vectors over title (weighted x2) + description, with crude
 * truncation stemming, plus "entity" extraction (names, products, versions)
 * from the original casing of the title.
 */

const STOPWORDS = new Set(
  `a an the and or but if of to in on at by for with from into onto over under about as is are was were be been being
  it its this that these those there their they them he she his her we our you your i me my not no nor so than then too
  very can could will would should may might must do does did done has have had having just also more most less least
  up down out off via vs per after before amid among new now how why what when where who which while says said say
  get gets got make makes made one two three first last year years day days week today yesterday report reports
  available availability generally launches launched launching introduces introducing announces announced
  releases released update updates support supports preview beta using use based anyway really doing`
    .split(/\s+/)
    .filter(Boolean),
);

/** Capitalised words that are headline furniture, not names. */
const NOT_ENTITIES = new Set(
  `announces announce announced launches launch launched unveils unveil unveiled releases release released
  ships ship shipped adds add added gets plans plan plans says report reports update updates new show ask
  why how what when breaking exclusive live watch opinion analysis review best top first latest
  ai ceo us uk eu usa api app apps llm llms tech data inc ltd corp co`
    .split(/\s+/)
    .filter(Boolean),
);

const STEM_LEN = 6;

export function stem(word: string): string {
  return /\d/.test(word) ? word : word.slice(0, STEM_LEN);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/** Proper nouns, product names and version numbers from a headline. */
export function entities(title: string): Set<string> {
  const out = new Set<string>();
  for (const raw of title.split(/[^A-Za-z0-9.]+/)) {
    const w = raw.replace(/^\.+|\.+$/g, "");
    if (w.length < 2) continue;
    const lower = w.toLowerCase();
    if (STOPWORDS.has(lower) || NOT_ENTITIES.has(lower)) continue;
    const isName = /^[A-Z]/.test(w) && /[a-z]/.test(w.slice(1));
    const isAcronym = /^[A-Z0-9]{2,}$/.test(w) && /[A-Z]/.test(w);
    const isVersion = /\d/.test(w) && /[.\d]/.test(w) && w.length >= 2;
    if (isName || isAcronym || isVersion) out.add(stem(lower));
  }
  return out;
}

export type Vector = Map<string, number>;

export interface Doc {
  title: string;
  description: string;
}

/** Builds L2-normalised TF-IDF vectors for every document. */
export function tfidfVectors(docs: Doc[]): Vector[] {
  const termCounts = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of tokenize(d.title)) tf.set(t, (tf.get(t) ?? 0) + 2);
    for (const t of tokenize(d.description).slice(0, 60)) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  });
  const df = new Map<string, number>();
  for (const tf of termCounts) for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  return termCounts.map((tf) => {
    const v: Vector = new Map();
    for (const [t, c] of tf) v.set(t, c * (Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1));
    return normalise(v);
  });
}

export function normalise(v: Vector): Vector {
  let sum = 0;
  for (const x of v.values()) sum += x * x;
  const len = Math.sqrt(sum) || 1;
  const out: Vector = new Map();
  for (const [k, x] of v) out.set(k, x / len);
  return out;
}

export function addInto(target: Vector, v: Vector): void {
  for (const [k, x] of v) target.set(k, (target.get(k) ?? 0) + x);
}

export function cosine(a: Vector, b: Vector): number {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, x] of small) {
    const y = big.get(k);
    if (y) dot += x * y;
  }
  return dot;
}
