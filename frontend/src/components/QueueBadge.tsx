import { useEffect, useState } from "react";
import { api, type QueueStats } from "../api";

interface Props {
  onStats?: (s: QueueStats) => void;
}

export function QueueBadge({ onStats }: Props) {
  const [stats, setStats] = useState<QueueStats | null>(null);

  useEffect(() => {
    const load = () =>
      api.queueStats()
        .then((s) => { setStats(s); onStats?.(s); })
        .catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [onStats]);

  if (!stats) return null;

  const total = stats.waiting + stats.active;

  return (
    <div className="flex items-center gap-2 text-xs">
      {total > 0 ? (
        <span className="flex items-center gap-1.5 bg-sky-900/50 border border-sky-800 text-sky-300 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          {total} queued
        </span>
      ) : (
        <span className="text-slate-700 hidden sm:inline">queue empty</span>
      )}
      {stats.completed > 0 && (
        <span className="text-slate-600 hidden sm:inline">{stats.completed} done</span>
      )}
      {stats.failed > 0 && (
        <span className="text-red-500">{stats.failed} failed</span>
      )}
    </div>
  );
}
