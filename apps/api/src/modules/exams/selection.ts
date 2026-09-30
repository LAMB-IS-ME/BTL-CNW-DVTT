import { randomInt } from "node:crypto";
import { check } from "../../utils/errors.js";
export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
// Bipartite matching handles overlapping pools without a greedy false shortage.
export function selectPools(
  pools: { ids: string[]; pickCount: number }[],
  excluded: string[],
  random = true,
): string[][] {
  const blocked = new Set(excluded);
  const slots = pools.flatMap((p, pool) =>
    Array.from({ length: p.pickCount }, () => ({
      pool,
      ids: random
        ? shuffle(p.ids.filter((id) => !blocked.has(id)))
        : p.ids.filter((id) => !blocked.has(id)),
    })),
  );
  const owner = new Map<string, number>();
  function match(slot: number, seen: Set<string>): boolean {
    for (const id of slots[slot]!.ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const old = owner.get(id);
      if (old === undefined || match(old, seen)) {
        owner.set(id, slot);
        return true;
      }
    }
    return false;
  }
  for (let i = 0; i < slots.length; i++)
    check(
      match(i, new Set()),
      400,
      "QUESTION_POOL_INSUFFICIENT",
      "Pool không đủ câu hỏi không trùng nhau.",
    );
  const selected = pools.map(() => [] as string[]);
  for (const [id, slot] of owner) selected[slots[slot]!.pool]!.push(id);
  return selected;
}
