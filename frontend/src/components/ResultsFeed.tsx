import type { RiskLevel } from "../api";
import { RiskBadge } from "./RiskBadge";

export interface FeedEntry {
  jobId: string;
  url: string;
  risk: RiskLevel;
  explanation: string;
  createdAt: string;
  memoryContextUsed?: boolean;
  source?: "scan" | "inbox" | "voice";
}

interface Props { entries: FeedEntry[] }

const sourceLabel: Record<string, string> = {
  scan: "URL Scan", inbox: "Inbox Sweep", voice: "Voice",
};

export function ResultsFeed({ entries }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Live Results
        </h2>
        {entries.length > 0 && (
          <span className="text-xs text-slate-500">{entries.length} scan{entries.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed border-slate-800 text-slate-600 gap-2">
          <span className="text-3xl">🛡️</span>
          <p className="text-sm">Scan results will appear here</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin pr-1">
          {entries.map((e) => (
            <ResultCard key={e.jobId} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ entry }: { entry: FeedEntry }) {
  const domain = (() => {
    try { return new URL(entry.url).hostname; } catch { return entry.url; }
  })();

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 transition-all ${
      entry.risk === "SCAM"
        ? "border-red-800 bg-red-950/30"
        : entry.risk === "SUSPICIOUS"
        ? "border-amber-800 bg-amber-950/20"
        : "border-slate-800 bg-slate-900/50"
    }`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-white truncate" title={entry.url}>
            {domain}
          </span>
          <span className="text-xs text-slate-500 truncate" title={entry.url}>
            {entry.url}
          </span>
        </div>
        <RiskBadge risk={entry.risk} />
      </div>

      {/* Explanation */}
      <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
        {entry.explanation}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-800">
        <div className="flex items-center gap-2">
          {entry.source && (
            <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[10px]">
              {sourceLabel[entry.source] ?? entry.source}
            </span>
          )}
          {entry.memoryContextUsed && (
            <span className="bg-sky-900/50 text-sky-400 px-1.5 py-0.5 rounded text-[10px]" title="Redis Agent Memory recalled past patterns">
              🧠 memory
            </span>
          )}
        </div>
        <span title={entry.createdAt}>
          {new Date(entry.createdAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
