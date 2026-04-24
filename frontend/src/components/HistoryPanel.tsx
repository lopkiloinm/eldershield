import { useEffect, useState } from "react";
import { api, type RiskEventRow } from "../api";
import { RiskBadge } from "./RiskBadge";
import { Spinner } from "./Spinner";

export function HistoryPanel() {
  const [rows, setRows]         = useState<RiskEventRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter]     = useState<"ALL" | "SCAM" | "SUSPICIOUS" | "SAFE">("ALL");

  const load = () => {
    setLoading(true);
    setError(null);
    api.recentScans(50)
      .then(setRows)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const counts = rows.reduce((acc, r) => { acc[r.risk] = (acc[r.risk] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const filtered = filter === "ALL" ? rows : rows.filter((r) => r.risk === filter);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Scan History</h2>
          <p className="text-slate-400 text-sm mt-1">Last 50 scans from Ghost DB — your durable audit log.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-secondary px-4 py-2 text-sm flex items-center gap-2 shrink-0"
        >
          {loading ? <Spinner size={3} /> : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {/* Summary */}
      {rows.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { key: "ALL", label: "Total", value: rows.length, color: "text-slate-300", bg: "border-slate-800" },
            { key: "SCAM", label: "Scams", value: counts["SCAM"] ?? 0, color: "text-red-400", bg: "border-red-900/50 bg-red-950/20" },
            { key: "SUSPICIOUS", label: "Suspicious", value: counts["SUSPICIOUS"] ?? 0, color: "text-amber-400", bg: "border-amber-900/50 bg-amber-950/10" },
            { key: "SAFE", label: "Safe", value: counts["SAFE"] ?? 0, color: "text-emerald-400", bg: "border-emerald-900/50 bg-emerald-950/10" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setFilter(s.key as typeof filter)}
              className={`rounded-xl border p-3 text-center transition-all ${s.bg} ${filter === s.key ? "ring-2 ring-sky-500/50" : "hover:border-slate-600"}`}
            >
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card border-red-900/60 p-4 text-sm text-red-300">{error}</div>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
          <Spinner size={5} />
          <span>Loading from Ghost DB…</span>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-700 gap-3">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">No scans yet — run a scan first</p>
        </div>
      )}

      {/* List */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-2 max-h-[calc(100vh-380px)] overflow-y-auto scrollbar-thin pr-0.5">
          {filtered.map((row) => {
            const domain = (() => { try { return new URL(row.url).hostname; } catch { return row.url; } })();
            const isOpen = expanded === row.jobId;
            return (
              <button
                key={row.jobId}
                onClick={() => setExpanded(isOpen ? null : row.jobId)}
                className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-all duration-150 ${
                  row.risk === "SCAM" ? "border-red-900/50 bg-red-950/15 hover:bg-red-950/30"
                  : row.risk === "SUSPICIOUS" ? "border-amber-900/40 bg-amber-950/10 hover:bg-amber-950/20"
                  : "border-slate-800/60 bg-slate-900/30 hover:bg-slate-900/60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="text-sm font-semibold text-white truncate">{domain}</span>
                    <span className="text-[11px] text-slate-600">{new Date(row.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <RiskBadge risk={row.risk} />
                    <svg className={`w-4 h-4 text-slate-600 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-slate-800/50 text-left space-y-2">
                    <p className="text-xs text-slate-500 font-mono truncate">{row.url}</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{row.explanation}</p>
                    <p className="text-[10px] text-slate-600 font-mono">job: {row.jobId}</p>
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
