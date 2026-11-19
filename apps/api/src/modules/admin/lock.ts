import type { Prisma } from "../../generated/prisma/client.js";

// Serialize status/role changes, including the actor recheck, until commit/rollback.
export async function lockAdminMutations(tx: Prisma.TransactionClient) {
  // PostgreSQL returns void; Prisma raw queries need a supported result type.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(904201)::text`;
}
