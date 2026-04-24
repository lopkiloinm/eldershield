import { useEffect, useState } from "react";
import { api, type QueueStats } from "../api";

export function QueueBadge() {
  const [stats, setStats] = useState<QueueStats | null>(null);

  useEffect(() => {
    const fetch = () => api.queueStats().then(setStats).catch(() => {});
    fetch();
    const id = setInterval(fetch, 5000);
    return () => clearInterval(id);
  }, []);

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
        <span className="text-slate-600">queue empty</span>
      )}
      {stats.completed > 0 && (
        <span className="text-slate-600">{stats.completed} done</span>
      )}
      {stats.failed > 0 && (
        <span className="text-red-500">{stats.failed} failed</span>
      )}
    </div>
  );
}
