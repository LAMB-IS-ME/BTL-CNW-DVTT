import { z } from "zod";
export function pagination(query: unknown) {
  const p = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().max(200).default(""),
    })
    .parse(query);
  return { ...p, skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

// Opt-in metadata preserves the legacy array DTO used by existing consumers.
export async function pageData<T>(
  query: unknown,
  items: T[],
  count: () => Promise<number>,
) {
  const { view } = z
    .object({ view: z.enum(["manage"]).optional() })
    .parse(query);
  return view === "manage" ? { items, total: await count() } : items;
}
