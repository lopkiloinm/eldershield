// ─── API client — mirrors the Express backend endpoints ──────────────────────

export type RiskLevel = "SAFE" | "SUSPICIOUS" | "SCAM";

export interface ScanUrlResponse {
  jobId: string;
  householdId: string;
}

export interface ScanResult {
  jobId: string;
  url: string;
  risk: RiskLevel;
  explanation: string;
  createdAt: string;
  memoryContextUsed?: boolean;
}

export interface PendingResult {
  status: "pending";
  jobId: string;
}

export interface WorkerResponse {
  jobId: string;
  risk: RiskLevel;
  explanation: string;
  memoryContextUsed: boolean;
}

export interface InboxSweepResponse {
  enqueued: number;
  householdId: string;
}

export interface VoiceResponse {
  jobIds: string[];
  message: string;
  urlsFound: number;
}

export interface HealthResponse {
  ok: boolean;
  db: boolean;
  redis: boolean;
  version: string;
}

const BASE = "/api";

async function post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error((err as { error?: string }).error ?? res.statusText), {
      status: res.status,
      body: err,
    });
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error((err as { error?: string }).error ?? res.statusText), {
      status: res.status,
      body: err,
    });
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => fetch("/healthz").then((r) => r.json() as Promise<HealthResponse>),

  scanUrl: (url: string, messageText?: string, householdId?: string) =>
    post<ScanUrlResponse>("/scan-url", { url, messageText, householdId }),

  getResult: (jobId: string) =>
    get<ScanResult | PendingResult>(`/scan-result/${jobId}`),

  processNext: () =>
    post<WorkerResponse | Record<string, never>>("/worker/scan-next", {}),

  inboxSweep: (paymentToken: string, householdId?: string) =>
    post<InboxSweepResponse>("/inbox-sweep", { householdId }, {
      "X-Payment-Token": paymentToken,
    }),

  voiceScan: (transcript: string, householdId?: string) =>
    post<VoiceResponse>("/voice/scan-message", { transcript, householdId }),
};
