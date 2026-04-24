import { useEffect, useState } from "react";
import { api, type RiskEventRow } from "../api";
import { RiskBadge } from "./RiskBadge";
import { Spinner } from "./Spinner";

export function HistoryPanel() {
  const [rows, setRows]       = useState<RiskEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.recentScans(30)
      .then(setRows)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const counts = rows.reduce(
    (acc, r) => { acc[r.risk] = (acc[r.risk] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Scan History</h2>
          <p className="text-xs text-slate-500 mt-0.5">Last 30 scans from Ghost DB</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 disabled:opacity-40"
        >
          {loading ? <Spinner size={3} /> : "↻"} Refresh
        </button>
      </div>

      {/* Summary pills */}
      {rows.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(["SCAM", "SUSPICIOUS", "SAFE"] as const).map((r) =>
            counts[r] ? (
              <span key={r} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                r === "SCAM" ? "bg-red-950/50 border-red-800 text-red-300"
                : r === "SUSPICIOUS" ? "bg-amber-950/40 border-amber-800 text-amber-300"
                : "bg-emerald-950/30 border-emerald-800 text-emerald-300"
              }`}>
                {counts[r]} {r}
              </span>
            ) : null
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
          <Spinner size={4} /> Loading from Ghost DB…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-slate-600 gap-2">
          <span className="text-2xl">📭</span>
          <p className="text-sm">No scans yet — run a scan first</p>
        </div>
      )}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-[calc(100vh-320px)] overflow-y-auto scrollbar-thin pr-1">
          {rows.map((row) => {
            const domain = (() => { try { return new URL(row.url).hostname; } catch { return row.url; } })();
            const isOpen = expanded === row.jobId;
            return (
              <button
                key={row.jobId}
                onClick={() => setExpanded(isOpen ? null : row.jobId)}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  row.risk === "SCAM" ? "border-red-900 bg-red-950/20 hover:bg-red-950/40"
                  : row.risk === "SUSPICIOUS" ? "border-amber-900 bg-amber-950/10 hover:bg-amber-950/30"
                  : "border-slate-800 bg-slate-900/50 hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm text-white font-medium truncate">{domain}</span>
                    <span className="text-[11px] text-slate-600">
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <RiskBadge risk={row.risk} />
                    <span className="text-slate-600 text-xs">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-2 pt-2 border-t border-slate-700/50 text-xs text-slate-400 leading-relaxed text-left">
                    <p className="mb-1 text-slate-500 truncate" title={row.url}>{row.url}</p>
                    <p>{row.explanation}</p>
                    <p className="mt-1 text-slate-600 font-mono">job: {row.jobId}</p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
