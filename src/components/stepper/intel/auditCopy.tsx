import type { StepperAuditEvent } from "@/lib/stepper/types";

/**
 * Rewrites a raw audit event into a sentence the investor can read at a
 * glance. The raw detail is technical ("Processed 06_PEP_Declaration.pdf:
 * PEP declaration"); this turns it into something like "We extracted your PEP
 * declaration and used it to pre-fill your answers."
 *
 * The rewrites are best-effort — anything we don't recognise falls back to
 * the original detail, lightly cleaned up.
 */
export function humaniseAuditEvent(e: StepperAuditEvent): string {
  const type = e.type.toLowerCase();
  const detail = e.detail.trim();

  // Couldn't classify (low-confidence "other"). Surface the file + recovery hint
  // so the investor can see the failure rather than a silent skip.
  if (/^couldn't categorise\s+/i.test(detail)) {
    return detail;
  }

  // Read as X but no slot on the active form accepts that type.
  if (/no\s+\S+\s+slot accepts/i.test(detail)) {
    return detail;
  }

  // "Processed 06_PEP_Declaration.pdf: PEP declaration"
  const processedMatch = /^processed\s+([^:]+?):\s*(.+)$/i.exec(detail);
  if (processedMatch) {
    const [, file, requirement] = processedMatch;
    return `We read ${cleanFileName(file)} and used it for your ${requirement.toLowerCase()}.`;
  }

  // "Identified PEP declaration — mapped to PEP declaration."
  if (/^identified\b/i.test(detail) && /mapped/i.test(detail)) {
    const item = detail
      .replace(/^identified\s+/i, "")
      .split(/—|-/)[0]
      .trim();
    return `We identified your ${item.toLowerCase()} and matched it to the right requirement.`;
  }

  // "Document received" / "Document uploaded"
  if (/uploaded|received/.test(type)) {
    return detail.length > 0 ? detail : "Document received and queued for processing.";
  }

  // "Reading document..."
  if (/reading/i.test(detail)) {
    return "We are reading your document and checking which onboarding item it satisfies.";
  }
  if (/classifying/i.test(detail)) {
    return "We are figuring out the document type.";
  }
  if (/matching/i.test(detail)) {
    return "We are matching the document to a requirement on your checklist.";
  }

  // "Cross-doc check: name mismatch …"
  if (/cross/i.test(type) || /mismatch/i.test(detail)) {
    return `Cross-document check: ${detail.replace(/^cross-doc check:\s*/i, "")}`;
  }

  // "Case created"
  if (/case created/i.test(type)) {
    return "We opened your onboarding case.";
  }

  // "Replaced …"
  if (/replaced/i.test(type)) {
    return detail;
  }

  // Fallback: lightly cleaned.
  return detail || e.type;
}

function cleanFileName(s: string): string {
  return s.replace(/^\d+_/, "").replace(/_/g, " ").trim();
}

/** Pick the most-recent interesting events from the audit log. */
export function recentDocEvents(audit: StepperAuditEvent[], limit: number): StepperAuditEvent[] {
  const interesting = audit.filter((e) =>
    /uploaded|received|classified|extract|match|attention|duplicate|ready|replaced|cross|processed|reading|classifying|identified/i.test(
      e.type + " " + e.detail,
    ),
  );
  const pool = interesting.length > 0 ? interesting : audit;
  return [...pool].reverse().slice(0, limit);
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
