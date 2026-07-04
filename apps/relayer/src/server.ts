import "dotenv/config";
import Fastify from "fastify";
import { LOCKED_CCTP } from "@shade/cctp-utils";
import { JobQueue } from "@shade/queue";
import { runRelayerLoop, RELAYER_JOB_TYPES } from "./worker.js";

// PHASE 2 relayer service: a queue worker that performs real CCTP/Stellar
// operations (inbound burn->mint->register, proof submissions) plus a health/route
// surface. Operator secrets stay in env; note secrets never leave the worker.
const app = Fastify({ logger: { redact: ["*.secret", "*.privateKey", "*.coinPath", "*.toSecret"] } });
const queue = new JobQueue();

app.get("/health", async () => ({ ok: true, service: "relayer", jobTypes: RELAYER_JOB_TYPES }));
app.get("/v1/cctp/route", async () => LOCKED_CCTP);
app.get("/v1/jobs/:job_id", async (request) => {
  const id = (request.params as { job_id: string }).job_id;
  const job = await queue.getJob(id);
  if (!job) return { error: "not found" };
  return { job_id: job.job_id, type: job.job_type, status: job.status, result: job.result, error: job.error };
});

void runRelayerLoop(queue).catch((e) => app.log.error({ err: (e as Error).message }, "relayer loop crashed"));

await app.listen({ port: Number(process.env.RELAYER_PORT ?? 8082), host: "0.0.0.0" });
