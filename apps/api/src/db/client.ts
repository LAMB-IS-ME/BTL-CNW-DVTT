import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
export const transactionOptions = { maxWait: 5000, timeout: 15000 };

export function createDb(connectionString: string) {
  return new PrismaClient({
    // Bound lock/connection waits while allowing cloud round-trip latency.
    transactionOptions,
    adapter: new PrismaPg({ connectionString, max: 10 }),
  });
}
export type Db = ReturnType<typeof createDb>;
