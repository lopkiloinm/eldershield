import { useState, useEffect, useCallback } from "react";
import { ShieldIcon } from "../components/ShieldIcon";
import { HealthBar } from "../components/HealthBar";
import { QueueBadge } from "../components/QueueBadge";
import { ScanPanel } from "../components/ScanPanel";
import { ResultsFeed } from "../components/ResultsFeed";
import { InboxSweepPanel } from "../components/InboxSweepPanel";
import { VoicePanel } from "../components/VoicePanel";
import { HistoryPanel } from "../components/HistoryPanel";
import { ArchitecturePanel } from "../components/ArchitecturePanel";
import { api, type HealthResponse, type QueueStats } from "../api";
import type { FeedEntry } from "../components/ResultsFeed";

type Tab = "scan" | "inbox" | "voice" | "history" | "arch";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "scan",
    label: "Scan URL",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    id: "inbox",
    label: "Inbox Sweep",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    ),
  },
  {
    id: "voice",
    label: "Voice",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    id: "history",
    label: "History",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: "arch",
    label: "Architecture",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
];

interface Props {
  onHome: () => void;
}

export function Dashboard({ onHome }: Props) {
  const [tab, setTab]               = useState<Tab>("scan");
  const [health, setHealth]         = useState<HealthResponse | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [results, setResults]       = useState<FeedEntry[]>([]);

  const pushResult = useCallback((entry: FeedEntry) => {
    setResults((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  const clearResults = useCallback(() => setResults([]), []);

  useEffect(() => {
    const check = () => api.health().then(setHealth).catch(() => setHealth(null));
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  const riskCounts = {
    SCAM:       results.filter((r) => r.risk === "SCAM").length,
    SUSPICIOUS: results.filter((r) => r.risk === "SUSPICIOUS").length,
    SAFE:       results.filter((r) => r.risk === "SAFE").length,
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* ── Header ── */}
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Logo — click to go home */}
          <button
            onClick={onHome}
            className="flex items-center gap-2.5 group"
          >
            <ShieldIcon className="w-7 h-7 text-sky-400 group-hover:text-sky-300 transition-colors" />
            <div className="hidden sm:block">
              <span className="text-white font-bold text-base tracking-tight group-hover:text-sky-100 transition-colors">
                ElderShield
              </span>
            </div>
          </button>

          {/* Center — tab bar (desktop) */}
          <nav className="hidden lg:flex items-center gap-1 bg-slate-900/60 rounded-xl p-1 border border-slate-800/60">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  tab === t.id
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          {/* Right — status */}
          <div className="flex items-center gap-3 sm:gap-4">
            <QueueBadge onStats={setQueueStats} />
            <div className="hidden sm:block w-px h-5 bg-slate-800" />
            <HealthBar health={health} />
          </div>
        </div>

        {/* Mobile tab bar */}
        <div className="lg:hidden border-t border-slate-800/60 flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-all ${
                tab === t.id
                  ? "text-sky-400 border-b-2 border-sky-500"
                  : "text-slate-500 hover:text-slate-300 border-b-2 border-transparent"
              }`}
            >
              {t.icon}
              <span className="hidden xs:block">{t.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ── Body ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
          {/* Left — active panel */}
          <div className="min-w-0">
            <div className="animate-fade-in" key={tab}>
              {tab === "scan"    && <ScanPanel    onResult={pushResult} />}
              {tab === "inbox"   && <InboxSweepPanel onResult={pushResult} />}
              {tab === "voice"   && <VoicePanel   onResult={pushResult} />}
              {tab === "history" && <HistoryPanel />}
              {tab === "arch"    && <ArchitecturePanel health={health} queueStats={queueStats} />}
            </div>
          </div>

          {/* Right — live results feed */}
          <div className="flex flex-col gap-4">
            {/* Mini stats bar */}
            {results.length > 0 && (
              <div className="grid grid-cols-3 gap-3 animate-fade-in">
                <MiniStat label="Scams" value={riskCounts.SCAM} color="text-red-400" bg="bg-red-950/30 border-red-900/50" />
                <MiniStat label="Suspicious" value={riskCounts.SUSPICIOUS} color="text-amber-400" bg="bg-amber-950/20 border-amber-900/50" />
                <MiniStat label="Safe" value={riskCounts.SAFE} color="text-emerald-400" bg="bg-emerald-950/20 border-emerald-900/50" />
              </div>
            )}
            <ResultsFeed entries={results} onClear={clearResults} />
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/50 py-3 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-[11px] text-slate-700">
          <button onClick={onHome} className="hover:text-slate-500 transition-colors">
            ← Back to home
          </button>
          <div className="hidden sm:flex items-center gap-2 flex-wrap justify-end">
            {["Ghost", "Redis", "TinyFish", "Nexla", "Vapi", "WunderGraph", "Senso", "Akash", "Chainguard", "x402"].map((t) => (
              <span key={t} className="hover:text-slate-500 transition-colors cursor-default">{t}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

function MiniStat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-center ${bg}`}>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
