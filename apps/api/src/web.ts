import express from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config/env.js";

// Only the production web bundle is public; never serve the monorepo root.
export function webRoutes(
  config: Config,
  directory = fileURLToPath(new URL("../../web/dist/", import.meta.url)),
) {
  const index = join(directory, "index.html");
  if (!existsSync(index))
    throw new Error("Build the web bundle before SERVE_WEB=true");
  const router = express.Router();
  const storageOrigin = config.SUPABASE_URL
    ? new URL(config.SUPABASE_URL).origin
    : undefined;
  router.use((req, res, next) => {
    if (/^\/(api|socket\.io)(\/|$)/.test(req.path)) return next("router");
    next();
  });
  router.use(
    helmet.contentSecurityPolicy({
      directives: {
        "img-src": [
          "'self'",
          "data:",
          ...(storageOrigin ? [storageOrigin] : []),
        ],
        "connect-src": [
          "'self'",
          ...config.origins.map((origin) => origin.replace(/^http/, "ws")),
        ],
      },
    }),
  );
  router.use(
    express.static(directory, {
      dotfiles: "deny",
      index: false,
      redirect: false,
      setHeaders: (res, path) => {
        res.setHeader(
          "Cache-Control",
          path.includes(`${join(directory, "assets")}/`)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      },
    }),
  );
  router.use((req, res, next) => {
    if (
      !["GET", "HEAD"].includes(req.method) ||
      !req.accepts("html") ||
      req.path.startsWith("/assets/") ||
      req.path.split("/").some((part) => part.startsWith(".")) ||
      extname(req.path)
    )
      return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(index);
  });
  return router;
}
