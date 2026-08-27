// Ported unmodified from marcelspahr.ch's app/lib/spamGuard.ts (no
// framework dependency there to begin with). Complements the best-effort
// per-instance rate limiter in security.ts with two payload-level checks:
//   1. Honeypot field: invisible to humans, almost always filled by bots.
//   2. Minimum fill time: a human needs a few seconds to complete a form;
//      scripted submissions post near-instantly.
const MIN_FILL_TIME_MS = 2500;
const MAX_FIELD_LENGTH = 5000;

export function isSpamSubmission(honeypot: unknown, startedAt: unknown): boolean {
  if (typeof honeypot === "string" && honeypot.trim().length > 0) return true;
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return true;
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_FILL_TIME_MS) return true;
  return false;
}

export function tooLong(value: unknown, max = MAX_FIELD_LENGTH): boolean {
  return typeof value === "string" && value.length > max;
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Escapes user input before it is interpolated into transactional HTML
// emails (Resend templates), preventing HTML/markup injection via form
// fields such as name or message.
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}
