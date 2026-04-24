import IORedis from "ioredis";
import { Queue, Worker, Job } from "bullmq";
import { config } from "./config";
import type { ScanJob } from "./models";

// ─── Connection ───────────────────────────────────────────────────────────────

function createRedisConnection(): IORedis {
  if (config.redisUrl) {
    return new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  }
  return new IORedis({
    host: config.redisHost,
    port: config.redisPort,
    maxRetriesPerRequest: null,
  });
}

export const redisConnection = createRedisConnection();

redisConnection.on("error", (err: Error) => {
  console.error("[redis] Connection error:", err.message);
});

redisConnection.on("connect", () => {
  console.log("[redis] Connected");
});

// ─── BullMQ Queue ─────────────────────────────────────────────────────────────

export const scanQueue = new Queue<ScanJob>(config.queueName, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

export async function enqueueScanJob(job: ScanJob): Promise<void> {
  await scanQueue.add(job.jobId, job, { jobId: job.jobId });
  console.log(`[queue] Enqueued job ${job.jobId} for URL: ${job.url}`);
}

export async function popNextScanJob(): Promise<Job<ScanJob> | null> {
  // Drain one job from the waiting list without starting a persistent worker.
  // This lets the HTTP endpoint POST /api/worker/scan-next act as a pull-based
  // worker (suitable for Akash cron containers or local cron).
  const waiting = await scanQueue.getJobs(["waiting"], 0, 0);
  if (waiting.length === 0) return null;
  return waiting[0];
}

export async function completeJob(job: Job<ScanJob>): Promise<void> {
  await job.moveToCompleted("done", "0", false);
}

export async function failJob(job: Job<ScanJob>, err: Error): Promise<void> {
  await job.moveToFailed(err, "0", false);
}

// ─── Worker factory (optional – for persistent background mode) ───────────────

export function createScanWorker(
  processor: (job: Job<ScanJob>) => Promise<void>
): Worker<ScanJob> {
  const worker = new Worker<ScanJob>(config.queueName, processor, {
    connection: createRedisConnection(),
    concurrency: 2,
  });

  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
