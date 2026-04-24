import { useState } from "react";
import type { RiskLevel } from "../api";
import { RiskBadge } from "./RiskBadge";

export interface FeedEntry {
  jobId: string;
  url: string;
  risk: RiskLevel;
  explanation: string;
  createdAt: string;
  householdId?: string;
  memoryContextUsed?: boolean;
  source?: "scan" | "inbox" | "voice";
}

interface Props {
  entries: FeedEntry[];
  onClear: () => void;
}

const sourceLabel: Record<string, string> = {
  scan: "URL Scan", inbox: "Inbox Sweep", voice: "Voice",
};

const sourceColor: Record<string, string> = {
  scan:  "bg-sky-900/50 text-sky-400",
  inbox: "bg-blue-900/50 text-blue-400",
  voice: "bg-pink-900/50 text-pink-400",
};

export function ResultsFeed({ entries, onClear }: Props) {
  const scams      = entries.filter((e) => e.risk === "SCAM").length;
  const suspicious = entries.filter((e) => e.risk === "SUSPICIOUS").length;
  const safe       = entries.filter((e) => e.risk === "SAFE").length;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Live Results
        </h2>
        <div className="flex items-center gap-3">
          {entries.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 text-xs">
                {scams > 0      && <span className="text-red-400">{scams} 🚨</span>}
                {suspicious > 0 && <span className="text-amber-400">{suspicious} ⚠️</span>}
                {safe > 0       && <span className="text-emerald-400">{safe} ✅</span>}
              </div>
              <button
                onClick={onClear}
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Empty state */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed border-slate-800 text-slate-600 gap-3">
          <span className="text-4xl">🛡️</span>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">No scans yet</p>
            <p className="text-xs text-slate-700 mt-0.5">Scan a URL, sweep the inbox, or try voice</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 max-h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin pr-1">
          {entries.map((e) => (
            <ResultCard key={e.jobId} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ entry }: { entry: FeedEntry }) {
  const [expanded, setExpanded] = useState(false);

  const domain = (() => {
    try { return new URL(entry.url).hostname; } catch { return entry.url; }
  })();

  const borderBg =
    entry.risk === "SCAM"
      ? "border-red-800 bg-red-950/30"
      : entry.risk === "SUSPICIOUS"
      ? "border-amber-800 bg-amber-950/20"
      : "border-slate-800 bg-slate-900/50";

  return (
    <div className={`rounded-xl border flex flex-col transition-all ${borderBg}`}>
      {/* Main row */}
      <button
        className="w-full text-left p-4 flex flex-col gap-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-semibold text-white truncate">{domain}</span>
            <span className="text-xs text-slate-500 truncate">{entry.url}</span>
          </div>
          <RiskBadge risk={entry.risk} />
        </div>

        {/* Explanation — collapsed to 2 lines, expands on click */}
        <p className={`text-xs text-slate-300 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
          {entry.explanation}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-slate-600 pt-1 border-t border-slate-800/60">
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.source && (
              <span className={`px-1.5 py-0.5 rounded ${sourceColor[entry.source] ?? "bg-slate-800 text-slate-400"}`}>
                {sourceLabel[entry.source] ?? entry.source}
              </span>
            )}
            {entry.memoryContextUsed && (
              <span
                className="bg-sky-900/50 text-sky-400 px-1.5 py-0.5 rounded"
                title="Redis Agent Memory recalled past patterns for this scan"
              >
                🧠 memory
              </span>
            )}
            <span className="font-mono text-slate-700">{entry.jobId.slice(0, 8)}</span>
          </div>
          <span title={entry.createdAt}>
            {new Date(entry.createdAt).toLocaleTimeString()}
          </span>
        </div>
      </button>

      {/* Expanded actions */}
      {expanded && (
        <div className="px-4 pb-3 flex items-center gap-3 border-t border-slate-800/40 pt-2">
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-500 hover:text-sky-400"
            onClick={(e) => e.stopPropagation()}
          >
            Open URL ↗
          </a>
          <span className="text-slate-700">·</span>
          <span className="text-xs text-slate-600 font-mono">job: {entry.jobId}</span>
          {entry.householdId && (
            <>
              <span className="text-slate-700">·</span>
              <span className="text-xs text-slate-600 font-mono truncate">hh: {entry.householdId.slice(0, 8)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
