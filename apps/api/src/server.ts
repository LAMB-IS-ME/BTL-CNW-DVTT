import { createRealtime } from "./sockets/server.js";
import { startExpiryJob } from "./jobs/expiry.js";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { parseEnv } from "./config/env.js";
import { createDb } from "./db/client.js";
const config = parseEnv(process.env);
const db = createDb(config.DATABASE_URL);
const stopExpiry = startExpiryJob(db);
const app = createApp({ db, config });
const server = createServer(app);
const realtime = createRealtime(server, app, db, config);
server.listen(config.PORT, "0.0.0.0", () =>
  console.info(JSON.stringify({ event: "server_started", port: config.PORT })),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    void realtime.close().then(() =>
      server.close(async () => {
        stopExpiry();
        app.locals.sessionStore.close();
        await app.locals.sessionPool.end();
        await db.$disconnect();
        process.exit(0);
      }),
    );
  });
