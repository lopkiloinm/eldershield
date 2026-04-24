import dotenv from "dotenv";
dotenv.config();

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function optional_env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional_env("PORT", "3000"), 10),

  // Ghost-managed Postgres
  databaseUrl: require_env("DATABASE_URL"),

  // Redis
  redisUrl: optional_env("REDIS_URL", ""),
  redisHost: optional_env("REDIS_HOST", "127.0.0.1"),
  redisPort: parseInt(optional_env("REDIS_PORT", "6379"), 10),

  // TinyFish Web Agent
  tinyfishApiKey: require_env("TINYFISH_API_KEY"),
  tinyfishEndpoint: "https://agent.tinyfish.ai/v1/automation/run-sse",

  // Nexla – Slack inbox ingestion via Tools API
  // Auth: session token (dev/hackathon) or service key (prod).
  // Session token: copy from https://dataops.nexla.io/nexla-api → Settings → Authentication.
  // Expires ~1h; fine for demo. For autonomous background jobs use a service key.
  //
  // Slack Nexset setup (one-time in Nexla UI):
  //   1. Integrate → New Data Flow → Slack connector
  //   2. Template: "Fetch Channel Messages (Incremental)" with your channel ID
  //   3. Copy the resulting Nexset ID → NEXLA_INBOX_NEXSET_ID
  nexlaSessionToken: require_env("NEXLA_SESSION_TOKEN"),
  nexlaInboxNexsetId: require_env("NEXLA_INBOX_NEXSET_ID"),
  nexlaApiBase: optional_env("NEXLA_API_URL", "https://dataops.nexla.io/nexla-api"),
  // Slack channel ID to sweep (used as fallback label in logs)
  nexlaSlackChannelId: optional_env("NEXLA_SLACK_CHANNEL_ID", ""),

  // GitHub – for cited.md publishing
  githubOwner: require_env("GITHUB_OWNER"),
  githubRepo: require_env("GITHUB_REPO"),
  githubToken: require_env("GITHUB_TOKEN"),
  githubCitedPath: optional_env("GITHUB_CITED_PATH", "cited.md"),
  githubBranch: optional_env("GITHUB_BRANCH", "main"),

  // x402 payment token (demo: any non-empty value is accepted)
  paymentTokenSecret: optional_env("PAYMENT_TOKEN_SECRET", "demo-token"),

  // BullMQ queue name
  queueName: "scan_jobs",

  // Redis Agent Memory Server
  // Run locally: docker run -d --name agent-memory \
  //   -e OPENAI_API_KEY=$OPENAI_API_KEY -e REDIS_URL=$REDIS_URL \
  //   -p 8000:8000 redis/agent-memory-server:latest
  agentMemoryUrl: optional_env("AGENT_MEMORY_URL", "http://localhost:8000"),
  agentMemoryToken: optional_env("AGENT_MEMORY_TOKEN", ""),

  // Senso context layer — makes cited.md discoverable + monetizable by AI agents
  sensoApiKey: optional_env("SENSO_API_KEY", ""),
  sensoApiBase: optional_env("SENSO_API_BASE", "https://api.senso.ai"),
  sensoCitedMdUrl: optional_env(
    "SENSO_CITED_MD_URL",
    "https://raw.githubusercontent.com/lopkiloinm/eldershield/main/cited.md"
  ),

  // Vapi voice AI
  vapiWebhookSecret: optional_env("VAPI_WEBHOOK_SECRET", ""),
  vapiApiKey: optional_env("VAPI_API_KEY", ""),
  publicUrl: optional_env("PUBLIC_URL", "http://localhost:3000"),

  // Autonomous worker loop
  autonomousMode: optional_env("AUTONOMOUS_MODE", "false") === "true",
  workerPollMs: parseInt(optional_env("WORKER_POLL_MS", "15000"), 10),
} as const;

export type Config = typeof config;
