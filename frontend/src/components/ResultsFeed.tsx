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

const SOURCE_STYLES: Record<string, string> = {
  scan:  "bg-sky-900/40 text-sky-400 border-sky-800/50",
  inbox: "bg-blue-900/40 text-blue-400 border-blue-800/50",
  voice: "bg-pink-900/40 text-pink-400 border-pink-800/50",
};
const SOURCE_LABELS: Record<string, string> = {
  scan: "URL Scan", inbox: "Inbox", voice: "Voice",
};

export function ResultsFeed({ entries, onClear }: Props) {
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Live Results
        </h2>
        {entries.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Empty */}
      {entries.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-64 rounded-2xl border border-dashed border-slate-800 text-slate-700 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600">No scans yet</p>
            <p className="text-xs text-slate-700 mt-1">Scan a URL, sweep the inbox, or try voice</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 overflow-y-auto scrollbar-thin max-h-[calc(100vh-280px)] pr-0.5">
          {entries.map((e) => <ResultCard key={e.jobId} entry={e} />)}
        </div>
      )}
    </div>
  );
}

function ResultCard({ entry }: { entry: FeedEntry }) {
  const [expanded, setExpanded] = useState(false);

  const domain = (() => { try { return new URL(entry.url).hostname; } catch { return entry.url; } })();

  const riskStyles = {
    SCAM:       "border-red-800/60 bg-red-950/25 hover:border-red-700/80",
    SUSPICIOUS: "border-amber-800/50 bg-amber-950/15 hover:border-amber-700/70",
    SAFE:       "border-slate-800/60 bg-slate-900/40 hover:border-slate-700/80",
  };

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${riskStyles[entry.risk]}`}>
      <button
        className="w-full text-left p-4 flex flex-col gap-2.5"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="text-sm font-semibold text-white truncate">{domain}</span>
            <span className="text-xs text-slate-500 truncate">{entry.url}</span>
          </div>
          <RiskBadge risk={entry.risk} />
        </div>

        {/* Explanation */}
        <p className={`text-xs text-slate-300 leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
          {entry.explanation}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-slate-600">
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.source && (
              <span className={`px-1.5 py-0.5 rounded-md border text-[10px] ${SOURCE_STYLES[entry.source] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                {SOURCE_LABELS[entry.source] ?? entry.source}
              </span>
            )}
            {entry.memoryContextUsed && (
              <span className="bg-sky-900/40 text-sky-400 border border-sky-800/50 px-1.5 py-0.5 rounded-md text-[10px]" title="Redis Agent Memory recalled past patterns">
                🧠 memory
              </span>
            )}
            <span className="font-mono text-slate-700">{entry.jobId.slice(0, 8)}</span>
          </div>
          <span title={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString()}</span>
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 flex items-center gap-3 border-t border-slate-800/40">
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-500 hover:text-sky-400 transition-colors flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            Open URL
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          {entry.householdId && (
            <>
              <span className="text-slate-700">·</span>
              <span className="text-xs text-slate-600 font-mono">hh: {entry.householdId.slice(0, 8)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
