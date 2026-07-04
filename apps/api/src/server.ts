import "dotenv/config";
import Fastify from "fastify";
import { registerRoutes } from "./routes.js";

const app = Fastify({ logger: { redact: ["req.headers.authorization", "*.privateKey", "*.secret", "*.note_secret"] } });

// CORS for the web app (browser at WEB_ORIGIN -> API). Allows the Privy Bearer
// token + idempotency header and credentials. Default permits localhost:3000.
const ALLOWED_ORIGINS = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim());
app.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    reply.header("access-control-allow-origin", origin);
    reply.header("access-control-allow-credentials", "true");
    reply.header("access-control-allow-headers", "content-type, authorization, idempotency-key");
    reply.header("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }
  if (request.method === "OPTIONS") { reply.code(204).send(); }
});

// Map validation (Zod) + explicit statusCode errors cleanly: a bad request body
// should be a 400, not a 500.
app.setErrorHandler((error, _req, reply) => {
  const e = error as { name?: string; statusCode?: number; message?: string };
  if (e.name === "ZodError") { reply.code(400).send({ error: "invalid request body", details: e.message }); return; }
  reply.code(e.statusCode ?? 500).send({ error: e.message ?? "internal error" });
});

await registerRoutes(app);

const port = Number(process.env.API_PORT ?? 8080);
await app.listen({ port, host: "0.0.0.0" });
