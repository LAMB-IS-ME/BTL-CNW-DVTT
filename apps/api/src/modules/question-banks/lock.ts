import type { Prisma } from "../../generated/prisma/client.js";
// Catalog writes and source materialization share one per-teacher lock. Always
// acquire Exam/Quiz locks first when needed; this module never locks those rows.
export async function lockCatalog(
  tx: Prisma.TransactionClient,
  teacherId: string,
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${teacherId}, 7419))::text`;
}
