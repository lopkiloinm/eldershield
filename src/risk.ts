import type { PageAnalysis, RiskClassification, RiskLevel } from "./models";

// ─── Keyword lists ────────────────────────────────────────────────────────────

const SCAM_KEYWORDS = [
  "verify your account",
  "your account has been suspended",
  "click here immediately",
  "you have won",
  "claim your prize",
  "limited time offer",
  "act now",
  "social security",
  "irs",
  "medicare",
  "refund pending",
  "unusual activity",
  "confirm your identity",
  "gift card",
  "wire transfer",
  "western union",
  "bitcoin payment",
  "crypto payment",
  "you owe",
  "arrest warrant",
  "legal action",
  "final notice",
];

const SUSPICIOUS_KEYWORDS = [
  "free",
  "winner",
  "congratulations",
  "selected",
  "exclusive offer",
  "urgent",
  "warning",
  "alert",
  "verify",
  "update your",
  "confirm your",
  "password",
  "login",
  "sign in",
];

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyRisk(
  page: PageAnalysis,
  messageText?: string,
  memoryContext?: string
): RiskClassification {
  const combinedText = [
    page.url,
    page.domain ?? "",
    messageText ?? "",
    memoryContext ?? "",
    JSON.stringify(page.raw),
  ]
    .join(" ")
    .toLowerCase();

  const scamKeywordsFound = SCAM_KEYWORDS.filter((kw) =>
    combinedText.includes(kw.toLowerCase())
  );

  const suspiciousKeywordsFound = SUSPICIOUS_KEYWORDS.filter((kw) =>
    combinedText.includes(kw.toLowerCase())
  );

  // ── SCAM: payment form + any scam keyword, or 3+ scam keywords, or memory recall ──
  const memoryRecalledScam =
    (memoryContext ?? "").toLowerCase().includes("scam") ||
    (memoryContext ?? "").toLowerCase().includes("phishing");

  if (
    (page.hasPaymentForm && scamKeywordsFound.length > 0) ||
    scamKeywordsFound.length >= 3 ||
    page.suspiciousSignals.includes("phishing_indicators") ||
    page.suspiciousSignals.includes("malware_indicators") ||
    page.suspiciousSignals.includes("impersonation") ||
    (memoryRecalledScam && page.suspiciousSignals.length > 0)
  ) {
    const risk: RiskLevel = "SCAM";
    const signals = [
      ...page.suspiciousSignals,
      ...scamKeywordsFound.slice(0, 3).map((k) => `keyword:"${k}"`),
    ].join(", ");
    return {
      risk,
      explanation: buildExplanation(risk, page, signals, scamKeywordsFound, suspiciousKeywordsFound, memoryContext),
    };
  }

  // ── SUSPICIOUS: any suspicious signal or keyword ─────────────────────────────
  if (
    page.suspiciousSignals.length > 0 ||
    scamKeywordsFound.length > 0 ||
    suspiciousKeywordsFound.length >= 2 ||
    page.hasLoginForm
  ) {
    const risk: RiskLevel = "SUSPICIOUS";
    const signals = [
      ...page.suspiciousSignals,
      ...scamKeywordsFound.map((k) => `keyword:"${k}"`),
    ].join(", ");
    return {
      risk,
      explanation: buildExplanation(risk, page, signals, scamKeywordsFound, suspiciousKeywordsFound, memoryContext),
    };
  }

  // ── SAFE ─────────────────────────────────────────────────────────────────────
  return {
    risk: "SAFE",
    explanation: `The URL ${page.url} appears safe. No suspicious signals were detected during automated analysis.`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildExplanation(
  risk: RiskLevel,
  page: PageAnalysis,
  signals: string,
  scamKws: string[],
  suspKws: string[],
  memoryContext?: string
): string {
  const parts: string[] = [];

  if (risk === "SCAM") {
    parts.push(`⚠️ SCAM DETECTED at ${page.url}.`);
  } else {
    parts.push(`⚠️ SUSPICIOUS content at ${page.url}.`);
  }

  if (page.domain) parts.push(`Domain: ${page.domain}.`);
  if (page.hasPaymentForm) parts.push("A payment form was found on this page.");
  if (page.hasLoginForm) parts.push("A login form was found on this page.");
  if (page.suspiciousSignals.length > 0) {
    parts.push(`Signals detected: ${page.suspiciousSignals.join(", ")}.`);
  }
  if (scamKws.length > 0) {
    parts.push(`Scam keywords found: ${scamKws.slice(0, 5).join(", ")}.`);
  } else if (suspKws.length > 0) {
    parts.push(`Suspicious keywords found: ${suspKws.slice(0, 5).join(", ")}.`);
  }

  if (signals) {
    parts.push(`All signals: ${signals}.`);
  }

  // Surface recalled memory context in the explanation
  if (memoryContext) {
    const firstRecall = memoryContext.split("\n").find((l) => l.startsWith("["));
    if (firstRecall) {
      parts.push(`Memory recall: ${firstRecall.replace(/^\[.*?\]\s*/, "")}`);
    }
  }

  parts.push("Do not provide personal information or payment details on this site.");

  return parts.join(" ");
}
