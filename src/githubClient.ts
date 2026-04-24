import { config } from "./config";

const GITHUB_API = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 15_000;

interface GitHubFileResponse {
  content: string;
  sha: string;
  encoding: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getCitedMd(): Promise<{ content: string; sha: string }> {
  const url = `${GITHUB_API}/repos/${config.githubOwner}/${config.githubRepo}/contents/${config.githubCitedPath}`;

  const response = await githubFetch(url, { method: "GET" });

  if (response.status === 404) {
    // File doesn't exist yet – return empty content with empty sha
    return { content: "", sha: "" };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(`GitHub GET ${config.githubCitedPath} HTTP ${response.status}: ${body}`);
  }

  const data = (await response.json()) as GitHubFileResponse;
  const decoded = Buffer.from(data.content, "base64").toString("utf-8");
  return { content: decoded, sha: data.sha };
}

export async function appendToCitedMd(entry: string): Promise<void> {
  console.log("[github] Appending entry to cited.md");

  let sha = "";
  let existing = "";

  try {
    const current = await getCitedMd();
    sha = current.sha;
    existing = current.content;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[github] Could not read cited.md (will create): ${msg}`);
  }

  const separator = existing.endsWith("\n") || existing === "" ? "" : "\n";
  const newContent = existing + separator + entry + "\n";
  const encoded = Buffer.from(newContent, "utf-8").toString("base64");

  const url = `${GITHUB_API}/repos/${config.githubOwner}/${config.githubRepo}/contents/${config.githubCitedPath}`;

  const body: Record<string, unknown> = {
    message: `ElderShield: append scan result`,
    content: encoded,
    branch: config.githubBranch,
  };

  if (sha) {
    body["sha"] = sha;
  }

  const response = await githubFetch(url, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const respBody = await response.text().catch(() => "(no body)");
    throw new Error(`GitHub PUT ${config.githubCitedPath} HTTP ${response.status}: ${respBody}`);
  }

  console.log("[github] cited.md updated successfully");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function githubFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.githubToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`GitHub fetch failed: ${msg}`);
  }
}
