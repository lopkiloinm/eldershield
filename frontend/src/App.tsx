import { useState, useEffect, useCallback } from "react";
import { ShieldIcon } from "./components/ShieldIcon";
import { HealthBar } from "./components/HealthBar";
import { QueueBadge } from "./components/QueueBadge";
import { ScanPanel } from "./components/ScanPanel";
import { ResultsFeed } from "./components/ResultsFeed";
import { InboxSweepPanel } from "./components/InboxSweepPanel";
import { VoicePanel } from "./components/VoicePanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { api, type HealthResponse } from "./api";
import type { FeedEntry } from "./components/ResultsFeed";

type Tab = "scan" | "inbox" | "voice" | "history";

export default function App() {
  const [tab, setTab]       = useState<Tab>("scan");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [results, setResults] = useState<FeedEntry[]>([]);

  const pushResult = useCallback((entry: FeedEntry) => {
    setResults((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  const clearResults = useCallback(() => setResults([]), []);

  // Poll health every 10s
  useEffect(() => {
    const check = () => api.health().then(setHealth).catch(() => setHealth(null));
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: "scan",    label: "Scan URL",    emoji: "🔍" },
    { id: "inbox",   label: "Inbox",       emoji: "📬" },
    { id: "voice",   label: "Voice",       emoji: "🎙️" },
    { id: "history", label: "History",     emoji: "📋" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldIcon className="w-8 h-8 text-sky-400" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">ElderShield</h1>
              <p className="text-xs text-slate-400 leading-none">Autonomous Scam Protection</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <QueueBadge />
            <HealthBar health={health} />
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column — controls */}
        <div className="flex flex-col gap-4">
          {/* Tab bar */}
          <div className="flex gap-1 bg-slate-900 rounded-xl p-1 border border-slate-800">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id
                    ? "bg-sky-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <span>{t.emoji}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {tab === "scan"    && <ScanPanel    onResult={pushResult} />}
          {tab === "inbox"   && <InboxSweepPanel onResult={pushResult} />}
          {tab === "voice"   && <VoicePanel   onResult={pushResult} />}
          {tab === "history" && <HistoryPanel />}
        </div>

        {/* Right column — live results feed */}
        <ResultsFeed entries={results} onClear={clearResults} />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800 py-3 text-center text-xs text-slate-700">
        ElderShield · Ghost DB · Redis Agent Memory · TinyFish · Nexla · GitHub · x402
      </footer>
    </div>
  );
}
