import type { RiskLevel } from "../api";

interface Props { risk: RiskLevel; large?: boolean }

const styles: Record<RiskLevel, string> = {
  SAFE:       "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  SUSPICIOUS: "bg-amber-900/60  text-amber-300  border-amber-700",
  SCAM:       "bg-red-900/60    text-red-300    border-red-700",
};

const emoji: Record<RiskLevel, string> = {
  SAFE: "✅", SUSPICIOUS: "⚠️", SCAM: "🚨",
};

export function RiskBadge({ risk, large }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full font-semibold ${
      large ? "px-4 py-1.5 text-base" : "px-2.5 py-0.5 text-xs"
    } ${styles[risk]}`}>
      <span>{emoji[risk]}</span>
      {risk}
    </span>
  );
}
