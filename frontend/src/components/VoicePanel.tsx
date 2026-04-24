import { useState, useRef, useEffect } from "react";
import { api, pollResult } from "../api";
import { Spinner } from "./Spinner";
import { RiskBadge } from "./RiskBadge";
import type { FeedEntry } from "./ResultsFeed";

interface Props {
  onResult: (entry: FeedEntry) => void;
}

type Phase = "idle" | "submitting" | "processing" | "done" | "error";
type RecordingState = "idle" | "recording" | "paused";

const EXAMPLES = [
  "Can you check this link for me? https://irs-refund-claim.net/verify",
  "My bank sent me this: https://secure-bankofamerica-login.com — is it safe?",
  "I got a text saying I won a prize at https://free-prize-winner.example.com/claim",
  "Medicare called and said to go to https://medicare-update-required.net",
];

export function VoicePanel({ onResult }: Props) {
  const [transcript, setTranscript] = useState("");
  const [phase, setPhase]           = useState<Phase>("idle");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [results, setResults]       = useState<FeedEntry[]>([]);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [browserSupport, setBrowserSupport] = useState(true);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Check browser support on mount
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setBrowserSupport(false);
    }
  }, []);

  // Timer for recording duration
  useEffect(() => {
    if (recordingState === "recording") {
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingState === "idle") setRecordingTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recordingState]);

  const startRecording = async () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        setErrorMsg("Speech recognition not supported in this browser. Try Chrome or Edge.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setRecordingState("recording");
        setIsListening(true);
        setErrorMsg(null);
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPiece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPiece + ' ';
          } else {
            interimTranscript += transcriptPiece;
          }
        }

        setTranscript((prev) => {
          const base = prev + finalTranscript;
          return base + (interimTranscript ? ` ${interimTranscript}` : '');
        });
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setRecordingState("idle");
        setIsListening(false);
        if (event.error !== 'no-speech') {
          setErrorMsg(`Recording error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setRecordingState("idle");
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start recording:', err);
      setErrorMsg('Failed to access microphone. Please grant permission.');
      setRecordingState("idle");
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setRecordingState("idle");
    setIsListening(false);
  };

  const toggleRecording = () => {
    if (recordingState === "recording") {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSubmit = async () => {
    if (!transcript.trim()) return;
    
    // Stop recording if still active
    if (recordingState === "recording") {
      stopRecording();
    }
    
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
    setTranscript("");
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const busy = phase === "submitting" || phase === "processing";

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700/50 rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">🎙️</span>
            Voice Scan
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Record or type a message. ElderShield extracts URLs and responds in plain language.
          </p>
        </div>
      </div>

      {/* Recording Button - Prominent */}
      <div className="flex flex-col items-center gap-4 py-4">
        <button
          onClick={toggleRecording}
          disabled={busy || !browserSupport}
          className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${
            recordingState === "recording"
              ? "bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/50 animate-pulse"
              : "bg-gradient-to-br from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/30"
          }`}
        >
          {recordingState === "recording" ? (
            <div className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 bg-white rounded" />
              <span className="text-[10px] text-white font-medium">STOP</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </div>
          )}
          
          {/* Pulse rings when recording */}
          {recordingState === "recording" && (
            <>
              <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
              <span className="absolute inset-0 rounded-full bg-red-500 animate-pulse opacity-30" />
            </>
          )}
        </button>

        {/* Recording time */}
        {recordingState === "recording" && (
          <div className="flex items-center gap-2 text-red-400 font-mono text-lg font-semibold animate-pulse">
            <span className="w-3 h-3 bg-red-500 rounded-full" />
            {formatTime(recordingTime)}
          </div>
        )}

        {/* Listening indicator */}
        {isListening && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="flex gap-1">
              <span className="w-1 h-4 bg-sky-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-4 bg-sky-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-4 bg-sky-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
            <span>Listening...</span>
          </div>
        )}

        {!browserSupport && (
          <p className="text-xs text-amber-400 bg-amber-900/20 border border-amber-800/50 rounded-lg px-3 py-2">
            Voice recording requires Chrome, Edge, or Safari
          </p>
        )}
      </div>

      {/* Transcript */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-slate-300 font-medium flex items-center justify-between">
          <span>Transcript</span>
          {transcript && (
            <button
              onClick={() => setTranscript("")}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          )}
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          disabled={busy || recordingState === "recording"}
          rows={4}
          placeholder="Click the microphone to record, or type your message here..."
          className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent disabled:opacity-50 resize-none transition-all"
        />
      </div>

      {/* Examples */}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Quick Examples</p>
        <div className="grid grid-cols-1 gap-1.5">
          {EXAMPLES.map((ex, idx) => (
            <button
              key={idx}
              onClick={() => setTranscript(ex)}
              disabled={busy || recordingState === "recording"}
              className="text-left text-xs text-slate-400 hover:text-sky-400 hover:bg-slate-800/50 px-3 py-2 rounded-lg transition-all truncate disabled:opacity-40 border border-transparent hover:border-slate-700"
            >
              <span className="text-slate-600 mr-2">→</span>
              {ex.slice(0, 80)}…
            </button>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={busy || !transcript.trim() || recordingState === "recording"}
        className="flex items-center justify-center gap-2 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all transform hover:scale-[1.02] disabled:hover:scale-100 shadow-lg"
      >
        {busy ? (
          <>
            <Spinner size={5} />
            <span>{phase === "submitting" ? "Analyzing..." : "Scanning URLs..."}</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Scan Message</span>
          </>
        )}
      </button>

      {/* Agent spoken response */}
      {agentMessage && (
        <div className="rounded-xl border border-sky-700/50 bg-gradient-to-br from-sky-950/40 to-sky-900/20 p-5 flex flex-col gap-3 shadow-lg">
          <div className="flex items-center gap-2 text-sm text-sky-300 font-medium">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
            <span>Agent Response</span>
            {busy && <Spinner size={4} />}
          </div>
          <p className="text-base text-slate-100 leading-relaxed">
            "{agentMessage}"
          </p>
        </div>
      )}

      {/* Per-URL results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Detected URLs</p>
          {results.map((r) => (
            <div key={r.jobId} className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 border transition-all ${
              r.risk === "SCAM" ? "bg-red-950/30 border-red-800/50 shadow-lg shadow-red-900/20"
              : r.risk === "SUSPICIOUS" ? "bg-amber-950/20 border-amber-800/50 shadow-lg shadow-amber-900/10"
              : "bg-emerald-950/20 border-emerald-800/50 shadow-lg shadow-emerald-900/10"
            }`}>
              <span className="text-sm text-slate-200 truncate flex-1 font-medium" title={r.url}>
                {(() => { try { return new URL(r.url).hostname; } catch { return r.url; } })()}
              </span>
              <RiskBadge risk={r.risk} />
            </div>
          ))}
        </div>
      )}

      {phase === "done" && (
        <button onClick={reset} className="text-sm text-slate-400 hover:text-slate-200 self-center transition-colors flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-800/50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          New Message
        </button>
      )}

      {phase === "error" && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-200 flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>{errorMsg}</span>
          </div>
          <button onClick={reset} className="text-red-400 hover:text-red-200 shrink-0 text-xl leading-none transition-colors">×</button>
        </div>
      )}
    </div>
  );
}
