import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
export function createDb(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 10 }),
  });
}
export type Db = ReturnType<typeof createDb>;
