import type { OnboardingCase, UploadedDocument, ChecklistItem } from "./types";

export type RequirementStatus = "Pending" | "Received" | "Needs attention";

const MATCHERS: { test: RegExp; accepts: string[] }[] = [
  { test: /certificate of incorporation/i, accepts: ["Certificate of Incorporation"] },
  { test: /certificate of formation/i, accepts: ["Certificate of Formation"] },
  { test: /certificate of limited partnership/i, accepts: ["Certificate of Formation"] },
  { test: /(memorandum and )?articles of association|constitutional documents|governing document/i, accepts: ["Articles of Association"] },
  { test: /(limited )?partnership agreement|trust deed/i, accepts: ["Limited Partnership Agreement"] },
  { test: /register of directors/i, accepts: ["Register of Directors"] },
  { test: /register of (shareholders|members|partners)|ownership evidence/i, accepts: ["Register of Members"] },
  { test: /tax residency|fatca|crs/i, accepts: ["FATCA / CRS declaration"] },
  { test: /source of funds/i, accepts: ["Source of Funds evidence", "Bank statement"] },
  { test: /source of wealth/i, accepts: ["Source of Funds evidence", "Bank statement"] },
  { test: /(government-issued )?photo id|passport|national id/i, accepts: ["Passport"] },
  { test: /proof of (residential )?address|utility bill/i, accepts: ["Proof of address"] },
  { test: /pep( declaration)?/i, accepts: ["PEP declaration"] },
];

export function acceptedClassifications(reqName: string): string[] {
  for (const m of MATCHERS) {
    if (m.test.test(reqName)) return m.accepts;
  }
  return [];
}

export interface RequirementProgress {
  status: RequirementStatus;
  document?: UploadedDocument;
  attentionItem?: ChecklistItem;
}

export function requirementProgress(reqName: string, c: OnboardingCase): RequirementProgress {
  const accepts = acceptedClassifications(reqName);
  if (accepts.length === 0) {
    const item = c.checklist.find((i) => i.name.toLowerCase() === reqName.toLowerCase());
    if (item?.status === "Received" || item?.status === "Accepted for onboarding review" || item?.status === "Investor confirmed") {
      return { status: "Received" };
    }
    if (item?.status === "Attention required" || item?.status === "Missing") {
      return { status: "Needs attention", attentionItem: item };
    }
    return { status: "Pending" };
  }
  const document = c.uploadedDocuments.find((d) => accepts.includes(d.classifiedAs));
  if (!document) return { status: "Pending" };
  const attentionItem = c.checklist.find(
    (i) =>
      i.sourceDocId === document.id &&
      (i.status === "Attention required" || i.status === "Missing"),
  );
  if (attentionItem) return { status: "Needs attention", document, attentionItem };
  return { status: "Received", document };
}
