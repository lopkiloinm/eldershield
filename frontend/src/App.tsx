import { useState, useEffect, useCallback } from "react";
import { ShieldIcon } from "./components/ShieldIcon";
import { HealthBar } from "./components/HealthBar";
import { ScanPanel } from "./components/ScanPanel";
import { ResultsFeed } from "./components/ResultsFeed";
import { InboxSweepPanel } from "./components/InboxSweepPanel";
import { VoicePanel } from "./components/VoicePanel";
import { api, type HealthResponse } from "./api";

type Tab = "scan" | "inbox" | "voice";

export default function App() {
  const [tab, setTab] = useState<Tab>("scan");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  // Shared results feed — all scans across panels land here
  const [results, setResults] = useState<import("./components/ResultsFeed").FeedEntry[]>([]);

  const pushResult = useCallback((entry: import("./components/ResultsFeed").FeedEntry) => {
    setResults((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  // Poll health every 10s
  useEffect(() => {
    const check = () => api.health().then(setHealth).catch(() => setHealth(null));
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: "scan",   label: "Scan URL",      emoji: "🔍" },
    { id: "inbox",  label: "Inbox Sweep",   emoji: "📬" },
    { id: "voice",  label: "Voice",         emoji: "🎙️" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldIcon className="w-8 h-8 text-sky-400" />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">ElderShield</h1>
              <p className="text-xs text-slate-400 leading-none">Autonomous Scam Protection</p>
            </div>
          </div>
          <HealthBar health={health} />
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
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
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

          {/* Active panel */}
          {tab === "scan"  && <ScanPanel  onResult={pushResult} />}
          {tab === "inbox" && <InboxSweepPanel onResult={pushResult} />}
          {tab === "voice" && <VoicePanel onResult={pushResult} />}
        </div>

        {/* Right column — live results feed */}
        <ResultsFeed entries={results} />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800 py-3 text-center text-xs text-slate-600">
        ElderShield · Ghost DB · Redis Agent Memory · TinyFish · Nexla · GitHub · x402
      </footer>
    </div>
  );
}
