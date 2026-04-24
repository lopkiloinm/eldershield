import type { HealthResponse } from "../api";

interface Props { health: HealthResponse | null }

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs">
      <span className={`w-2 h-2 rounded-full transition-colors ${ok ? "bg-emerald-400" : "bg-red-500 animate-pulse"}`} />
      <span className={ok ? "text-slate-400" : "text-red-400"}>{label}</span>
    </span>
  );
}

export function HealthBar({ health }: Props) {
  if (!health) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className="w-2 h-2 rounded-full bg-slate-600 animate-pulse" />
        connecting…
      </span>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <Dot ok={health.db}    label="DB" />
      <Dot ok={health.redis} label="Redis" />
      <span className="text-xs text-slate-700 hidden sm:inline">v{health.version}</span>
    </div>
  );
}
