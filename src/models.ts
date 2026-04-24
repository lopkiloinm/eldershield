// ─── Domain types ────────────────────────────────────────────────────────────

export interface ScanJob {
  jobId: string;
  householdId: string;
  url: string;
  messageText?: string;
  messageId?: string;
}

export interface PageAnalysis {
  url: string;
  finalUrl?: string;
  domain?: string;
  hasLoginForm?: boolean;
  hasPaymentForm?: boolean;
  suspiciousSignals: string[]; // e.g. ['brand_mismatch', 'urgency_language']
  raw: unknown;
}

export type RiskLevel = "SAFE" | "SUSPICIOUS" | "SCAM";

export interface RiskClassification {
  risk: RiskLevel;
  explanation: string;
}

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface HouseholdRow {
  id: string;
  label: string;
  created_at: Date;
}

export interface MessageRow {
  id: string;
  household_id: string;
  source: "manual" | "inbox";
  raw_text: string;
  created_at: Date;
}

export interface UrlInspectionRow {
  id: string;
  message_id: string | null;
  url: string;
  domain: string | null;
  tinyfish_run_id: string | null;
  raw_page_summary: unknown;
  created_at: Date;
}

export interface RiskEventRow {
  id: string;
  household_id: string;
  url_inspection_id: string | null;
  risk: RiskLevel;
  explanation: string;
  created_at: Date;
}
