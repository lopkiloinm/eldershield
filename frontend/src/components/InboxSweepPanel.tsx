import { useState } from "react";
import { api } from "../api";
import { Spinner } from "./Spinner";
import type { FeedEntry } from "./ResultsFeed";

interface Props {
  onResult: (entry: FeedEntry) => void;
}

type Phase = "idle" | "sweeping" | "processing" | "done" | "error" | "payment_required";

export function InboxSweepPanel({ onResult }: Props) {
  const [token, setToken]       = useState("demo-token");
  const [phase, setPhase]       = useState<Phase>("idle");
  const [enqueued, setEnqueued] = useState<number | null>(null);
  const [processed, setProcessed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSweep = async () => {
    setPhase("sweeping");
    setEnqueued(null);
    setProcessed(0);
    setErrorMsg(null);

    try {
      const resp = await api.inboxSweep(token.trim());
      setEnqueued(resp.enqueued);

      if (resp.enqueued === 0) {
        setPhase("done");
        return;
      }

      // Process each enqueued job sequentially
      setPhase("processing");
      let count = 0;
      for (let i = 0; i < resp.enqueued; i++) {
        try {
          const workerResp = await api.processNext();
          if ("jobId" in workerResp && workerResp.jobId) {
            // Fetch the full result for the feed
            try {
              const result = await api.getResult(workerResp.jobId);
              if ("risk" in result) {
                onResult({
                  jobId: result.jobId,
                  url: result.url,
                  risk: result.risk,
                  explanation: result.explanation,
                  createdAt: result.createdAt,
                  memoryContextUsed: workerResp.memoryContextUsed,
                  source: "inbox",
                });
              }
            } catch { /* non-fatal */ }
            count++;
            setProcessed(count);
          }
        } catch { /* non-fatal per-job */ }
      }
      setPhase("done");
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 402) {
        setPhase("payment_required");
      } else {
        setPhase("error");
        setErrorMsg(e.message ?? String(err));
      }
    }
  };

  const reset = () => {
    setPhase("idle");
    setEnqueued(null);
    setProcessed(0);
    setErrorMsg(null);
  };

  const busy = phase === "sweeping" || phase === "processing";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-white">Inbox Sweep</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Pulls Slack messages from Nexla, extracts URLs, and scans each one autonomously.
          Requires an <code className="text-sky-400">X-Payment-Token</code> (x402).
        </p>
      </div>

      {/* Payment token */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
          X-Payment-Token
          <span className="bg-amber-900/50 text-amber-400 text-[10px] px-1.5 py-0.5 rounded border border-amber-800">x402</span>
        </label>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={busy}
          placeholder="demo-token"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-50 font-mono"
        />
        <p className="text-[11px] text-slate-600">
          Use <code className="text-slate-500">demo-token</code> for local dev. Set <code className="text-slate-500">PAYMENT_TOKEN_SECRET</code> in .env for production.
        </p>
      </div>

      {/* Action */}
      <button
        onClick={handleSweep}
        disabled={busy || !token.trim()}
        className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {busy
          ? <><Spinner size={4} /> {phase === "sweeping" ? "Fetching Slack messages…" : `Processing ${processed}/${enqueued ?? "?"}…`}</>
          : "📬 Sweep Inbox"}
      </button>

      {/* 402 state */}
      {phase === "payment_required" && (
        <div className="bg-amber-950/40 border border-amber-800 rounded-lg px-4 py-3 flex flex-col gap-1">
          <p className="text-sm font-semibold text-amber-300">402 Payment Required</p>
          <p className="text-xs text-amber-400">
            The server rejected the token. Enter a valid <code>X-Payment-Token</code> to proceed.
          </p>
          <button onClick={reset} className="text-xs text-amber-600 hover:text-amber-400 mt-1 self-start">Try again</button>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="bg-emerald-950/30 border border-emerald-800 rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-300">
              {enqueued === 0 ? "No URLs found in inbox" : `Processed ${processed} of ${enqueued} URLs`}
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">Results are in the feed →</p>
          </div>
          <button onClick={reset} className="text-xs text-emerald-600 hover:text-emerald-400">New sweep</button>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-300 flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button onClick={reset} className="text-red-500 hover:text-red-300 shrink-0">✕</button>
        </div>
      )}

      {/* Info box */}
      <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
        <p>🔗 Nexla pulls from your Slack channel Nexset</p>
        <p>🧠 Redis Agent Memory recalls past scam patterns</p>
        <p>📄 Results published to <code className="text-slate-400">cited.md</code> on GitHub</p>
      </div>
    </div>
  );
}
