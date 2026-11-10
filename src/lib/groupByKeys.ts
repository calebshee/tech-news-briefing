/**
 * Groups items so that any two sharing a key end up together (transitively),
 * using union-find. Order of first appearance is kept.
 */
export function groupByKeys<T>(items: T[], keysOf: (item: T) => string[]): T[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  const owner = new Map<string, number>();
  items.forEach((item, i) => {
    for (const key of keysOf(item)) {
      const j = owner.get(key);
      if (j === undefined) owner.set(key, i);
      else parent[find(i)] = find(j);
    }
  });

  const groups = new Map<number, T[]>();
  items.forEach((item, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(item);
    else groups.set(root, [item]);
  });
  return [...groups.values()];
}
