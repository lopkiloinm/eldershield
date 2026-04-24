import { useState } from "react";
import { api } from "../api";
import { Spinner } from "./Spinner";
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
  const [response, setResponse]     = useState<string | null>(null);
  const [jobIds, setJobIds]         = useState<string[]>([]);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!transcript.trim()) return;
    setPhase("submitting");
    setResponse(null);
    setErrorMsg(null);
    setJobIds([]);

    try {
      const voiceResp = await api.voiceScan(transcript.trim());
      setResponse(voiceResp.message);
      setJobIds(voiceResp.jobIds);
      setPhase("processing");

      // Process each job
      for (const jid of voiceResp.jobIds) {
        try {
          await api.processNext();
          // Poll once for result
          for (let attempt = 0; attempt < 15; attempt++) {
            await new Promise((r) => setTimeout(r, 2000));
            const result = await api.getResult(jid);
            if ("risk" in result) {
              onResult({
                jobId: result.jobId,
                url: result.url,
                risk: result.risk,
                explanation: result.explanation,
                createdAt: result.createdAt,
                source: "voice",
              });
              break;
            }
          }
        } catch { /* non-fatal */ }
      }

      setPhase("done");
    } catch (err: unknown) {
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const reset = () => {
    setPhase("idle");
    setResponse(null);
    setErrorMsg(null);
    setJobIds([]);
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

      {/* Transcript */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400 font-medium">Transcript *</label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          disabled={busy}
          rows={4}
          placeholder="Type what was said or paste a suspicious message…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-50 resize-none"
        />
      </div>

      {/* Example prompts */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-slate-600 uppercase tracking-wider">Try an example</p>
        <div className="flex flex-col gap-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setTranscript(ex)}
              disabled={busy}
              className="text-left text-xs text-slate-500 hover:text-sky-400 hover:bg-slate-800 px-2 py-1.5 rounded transition-colors truncate disabled:opacity-40"
            >
              "{ex.slice(0, 70)}…"
            </button>
          ))}
        </div>
      </div>

      {/* Action */}
      <button
        onClick={handleSubmit}
        disabled={busy || !transcript.trim()}
        className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {busy
          ? <><Spinner size={4} /> {phase === "submitting" ? "Submitting…" : `Scanning ${jobIds.length} URL${jobIds.length !== 1 ? "s" : ""}…`}</>
          : "🎙️ Scan Message"}
      </button>

      {/* Voice response */}
      {response && (
        <div className={`rounded-xl border p-4 flex flex-col gap-2 ${
          phase === "done" ? "border-sky-800 bg-sky-950/30" : "border-slate-700 bg-slate-800/50"
        }`}>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>🔊</span>
            <span>Agent response</span>
            {busy && <Spinner size={3} />}
          </div>
          <p className="text-sm text-slate-200 leading-relaxed italic">"{response}"</p>
          {phase === "done" && (
            <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300 self-end mt-1">
              New message
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-300 flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button onClick={reset} className="text-red-500 hover:text-red-300 shrink-0">✕</button>
        </div>
      )}
    </div>
  );
}
