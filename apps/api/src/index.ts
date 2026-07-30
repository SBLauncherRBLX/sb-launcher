import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config.js";
import { registerRoutes } from "./routes.js";
import { ensureBuildFreshness } from "./lib/buildFreshness.js";
import { ensurePrivateServerTable } from "./modules/privateServers.js";

async function main() {
  await ensureBuildFreshness();
  await ensurePrivateServerTable();

  const app = Fastify({
    logger: true,
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });

  await registerRoutes(app);

  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`SB Launcher API listening on http://${env.HOST}:${env.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
