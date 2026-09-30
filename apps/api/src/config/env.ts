import "dotenv/config";
import { z } from "zod";
export function parseEnv(input: NodeJS.ProcessEnv) {
  const result = z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      DATABASE_URL: z.string().min(1),
      SESSION_SECRET: z.string().min(32),
      CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
      SESSION_COOKIE_NAME: z.string().default("online_exam_sid"),
      SESSION_MAX_AGE_MS: z.coerce.number().positive().default(28800000),
      COOKIE_SECURE: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
      COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
      TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
      SUPABASE_URL: z.string().optional(),
      SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
      SUPABASE_STORAGE_BUCKET: z.string().default("question-assets"),
    })
    .parse(input);
  const origins = result.CLIENT_ORIGIN.split(",").map((s) => s.trim());
  if (origins.some((s) => new URL(s).origin !== s))
    throw new Error("CLIENT_ORIGIN must contain exact origins");
  if (
    (result.NODE_ENV === "production" || result.COOKIE_SAME_SITE === "none") &&
    !result.COOKIE_SECURE
  )
    throw new Error("Secure cookies required");
  if (
    result.NODE_ENV === "production" &&
    origins.some((s) => !s.startsWith("https://"))
  )
    throw new Error("HTTPS origins required");
  return { ...result, origins };
}
export type Config = ReturnType<typeof parseEnv>;
