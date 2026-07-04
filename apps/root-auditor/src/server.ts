import "dotenv/config";
import Fastify from "fastify";
import { runAudit } from "./run.js";

// root-auditor HTTP surface. The API/relayer can call /v1/audit before
// allowing spends and refuse any spend when status != OK (ROOT_MISMATCH_CRITICAL).
const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, service: "root-auditor" }));

app.get("/v1/audit", async (_req, reply) => {
  try {
    const result = await runAudit();
    // 200 when healthy, 409 when a critical mismatch is detected so callers can gate spends.
    reply.code(result.status === "OK" ? 200 : 409);
    return result;
  } catch (e) {
    reply.code(500);
    return { error: (e as Error).message };
  }
});

const interval = Number(process.env.ROOT_AUDIT_INTERVAL_MS ?? "0");
if (interval > 0) {
  // Optional background loop: periodically audit and log critical findings.
  const tick = async () => {
    try {
      const r = await runAudit();
      if (r.status !== "OK") app.log.error({ audit: r }, "ROOT_MISMATCH_CRITICAL");
      else app.log.info({ leafCount: r.leafCount, root: r.onchainRootHex }, "root audit OK");
    } catch (e) {
      app.log.error({ err: (e as Error).message }, "root audit failed");
    }
  };
  setInterval(tick, interval);
}

await app.listen({ port: Number(process.env.ROOT_AUDITOR_PORT ?? 8084), host: "0.0.0.0" });
