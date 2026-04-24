import { useState } from "react";
import { api, pollResult } from "../api";
import { Spinner } from "./Spinner";
import { RiskBadge } from "./RiskBadge";
import type { FeedEntry } from "./ResultsFeed";

interface Props {
  onResult: (entry: FeedEntry) => void;
}

type Phase = "idle" | "submitting" | "processing" | "done" | "error";

const EXAMPLES = [
  "Can you check this link for me? https://irs-refund-claim.net/verify",
  "My bank sent me this: https://secure-bankofamerica-login.com — is it safe?",
  "I got a text saying I won a prize at https://free-prize-winner.example.com/claim",
  "Medicare called and said to go to https://medicare-update-required.net",
];

export function VoicePanel({ onResult }: Props) {
  const [transcript, setTranscript] = useState("");
  const [phase, setPhase]           = useState<Phase>("idle");
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [results, setResults]       = useState<FeedEntry[]>([]);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!transcript.trim()) return;
    setPhase("submitting");
    setAgentMessage(null);
    setResults([]);
    setErrorMsg(null);

    try {
      const voiceResp = await api.voiceScan(transcript.trim());
      setAgentMessage(voiceResp.message);

      if (voiceResp.jobIds.length === 0) {
        setPhase("done");
        return;
      }

      setPhase("processing");

      // Trigger worker for each job, then poll
      const entries: FeedEntry[] = [];
      for (const jid of voiceResp.jobIds) {
        try {
          await api.processNext();
          const result = await pollResult(jid, { intervalMs: 1500, timeoutMs: 90_000 });
          const entry: FeedEntry = {
            jobId: result.jobId,
            url: result.url,
            risk: result.risk,
            explanation: result.explanation,
            createdAt: result.createdAt,
            source: "voice",
          };
          entries.push(entry);
          setResults([...entries]);
          onResult(entry);
        } catch { /* non-fatal per-job */ }
      }

      setPhase("done");
    } catch (err: unknown) {
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const reset = () => {
    setPhase("idle");
    setAgentMessage(null);
    setResults([]);
    setErrorMsg(null);
  };

  const busy = phase === "submitting" || phase === "processing";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-white">Voice Scan</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Type or paste a spoken message. ElderShield extracts URLs and responds in plain language — ready for a voice agent to read aloud.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400 font-medium">Transcript *</label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="Type what was said or paste a suspicious message…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-50 resize-none"
        />
      </div>

      {/* Examples */}
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-slate-600 uppercase tracking-wider">Try an example</p>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setTranscript(ex)}
            disabled={busy}
            className="text-left text-xs text-slate-500 hover:text-sky-400 hover:bg-slate-800 px-2 py-1.5 rounded transition-colors truncate disabled:opacity-40"
          >
            "{ex.slice(0, 72)}…"
          </button>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={busy || !transcript.trim()}
        className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {busy
          ? <><Spinner size={4} />{phase === "submitting" ? "Submitting…" : "Scanning…"}</>
          : "🎙️ Scan Message"}
      </button>

      {/* Agent spoken response */}
      {agentMessage && (
        <div className="rounded-xl border border-sky-800 bg-sky-950/30 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>🔊</span><span>Agent response</span>
            {busy && <Spinner size={3} />}
          </div>
          <p className="text-sm text-slate-200 leading-relaxed italic">"{agentMessage}"</p>
        </div>
      )}

      {/* Per-URL results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((r) => (
            <div key={r.jobId} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 border text-xs ${
              r.risk === "SCAM" ? "bg-red-950/30 border-red-800"
              : r.risk === "SUSPICIOUS" ? "bg-amber-950/20 border-amber-800"
              : "bg-emerald-950/20 border-emerald-800"
            }`}>
              <span className="text-slate-300 truncate flex-1" title={r.url}>
                {(() => { try { return new URL(r.url).hostname; } catch { return r.url; } })()}
              </span>
              <RiskBadge risk={r.risk} />
            </div>
          ))}
        </div>
      )}

      {phase === "done" && (
        <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300 self-end">
          New message
        </button>
      )}

      {phase === "error" && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-300 flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button onClick={reset} className="text-red-500 hover:text-red-300 shrink-0 text-lg leading-none">✕</button>
        </div>
      )}
    </div>
  );
}
