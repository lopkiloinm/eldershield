import type { RiskLevel } from "../api";

interface Props { risk: RiskLevel; large?: boolean }

const STYLES: Record<RiskLevel, string> = {
  SAFE:       "bg-emerald-900/50 text-emerald-300 border-emerald-700/60",
  SUSPICIOUS: "bg-amber-900/50  text-amber-300  border-amber-700/60",
  SCAM:       "bg-red-900/50    text-red-300    border-red-700/60",
};

const ICONS: Record<RiskLevel, string> = {
  SAFE: "✅", SUSPICIOUS: "⚠️", SCAM: "🚨",
};

export function RiskBadge({ risk, large }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full font-semibold shrink-0 ${
      large ? "px-4 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
    } ${STYLES[risk]}`}>
      <span className={large ? "text-base" : "text-xs"}>{ICONS[risk]}</span>
      {risk}
    </span>
  );
}
