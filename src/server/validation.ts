import { randomUUID } from "node:crypto";
import type {
  OnboardingCase,
  ChecklistItem,
  RedFlag,
  RelatedParty,
  ExtractedField,
  ChecklistStatus,
  MatchOutcome,
  LegalForm,
} from "@/lib/onboarding/types";
import type { ClassifiedDoc } from "./classification";
import { humanLabelFor, isPresent } from "./classification";
import { fitsLegalForm, suggestLegalForm } from "./legalFormFit";

export interface ValidationResult {
  classifiedAs: string;
  party: string;
  checklistAdditions: ChecklistItem[];
  redFlagAdditions: RedFlag[];
  extractedFieldAdditions: ExtractedField[];
  relatedPartyAdditions: RelatedParty[];
  agentMessage: string;
  auditDetail: string;
  /** How this document was slotted (or not) into the active checklist. */
  matchOutcome: MatchOutcome;
  /** Human-readable explanation when matchOutcome is unmatched_*. */
  matchReason?: string;
  /** Suggested legal form when matchOutcome is unmatched_wrong_form. */
  suggestedLegalForm?: LegalForm;
}

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function tryDate(s: string | null | undefined): Date | null {
  if (!isPresent(s)) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function pickName(...candidates: string[]): string {
  for (const c of candidates) {
    if (isPresent(c)) return c;
  }
  return "Investor";
}

function parsePct(s: string): number | undefined {
  if (!isPresent(s)) return undefined;
  const cleaned = s.replace(/[%\s,]/g, "");
  const n = Number(cleaned);
  return isNaN(n) ? undefined : n;
}

export function validateDocument(
  c: OnboardingCase,
  doc: ClassifiedDoc,
  docId: string,
  fileName: string,
): ValidationResult {
  const checklist: ChecklistItem[] = [];
  const flags: RedFlag[] = [];
  const fields: ExtractedField[] = [];
  const parties: RelatedParty[] = [];
  const now = new Date();
  const partyName = pickName(doc.party_name, doc.legal_name, doc.holder_name, c.investorName);

  const messages: string[] = [];
  const auditFragments: string[] = [];

  // Short-circuit: document type doesn't fit the active legal form.
  // Don't create checklist rows, extract fields, or add related parties —
  // they belong to a different onboarding flow. The doc is surfaced in the
  // Unmatched uploads tray, where the investor can switch onboarding type
  // or remove the file. (The `other` type is handled further below as a
  // distinct unknown-type case, not as wrong-form.)
  if (doc.document_type !== "other" && !fitsLegalForm(doc.document_type, c.legalForm)) {
    const label = humanLabelFor(doc.document_type);
    const suggested = suggestLegalForm(doc.document_type);
    const reason = c.legalForm
      ? `${label} doesn't fit ${c.legalForm} onboarding${suggested ? ` — it usually belongs to ${suggested}` : ""}.`
      : `${label} could not be slotted because no legal form is set yet.`;
    return {
      classifiedAs: label,
      party: partyName,
      checklistAdditions: [],
      redFlagAdditions: [],
      extractedFieldAdditions: [],
      relatedPartyAdditions: [],
      agentMessage: `Identified ${label}, but ${reason} Open the document checklist to switch onboarding type or remove the file.`,
      auditDetail: `${label} uploaded but unmatched (wrong form: ${c.legalForm ?? "unset"})`,
      matchOutcome: "unmatched_wrong_form",
      matchReason: reason,
      suggestedLegalForm: suggested,
    };
  }

  const makeItem = (
    name: string,
    reason: string,
    status: ChecklistStatus,
  ): ChecklistItem => ({
    id: id("cl"),
    name,
    party: partyName,
    reason,
    status,
    receivedAt: now.toISOString(),
    sourceDocId: docId,
  });

  const lowConfidenceFlag = () => {
    if (doc.confidence === "low") {
      flags.push({
        id: id("rf"),
        category: "Classification",
        description: `Low-confidence classification for ${fileName}.`,
        relatedParty: partyName,
        sourceDoc: fileName,
        severity: "Low",
        rule: "CLS-LOW-CONFIDENCE",
        evidence: doc.summary,
        recommendedAction: "Manual review by Compliance team.",
        status: "Open",
      });
    }
  };

  switch (doc.document_type) {
    case "passport": {
      const holder = pickName(doc.holder_name, partyName);
      const item = makeItem(
        `Passport — ${holder}`,
        "Identity verification for authorised signatory",
        "Received",
      );
      const expiry = tryDate(doc.expiry_date);
      if (expiry && expiry < now) {
        item.status = "Attention required";
        item.investorIssue = `Passport expired on ${doc.expiry_date}.`;
        item.remedy = "Please upload a current, in-date passport.";
        flags.push({
          id: id("rf"),
          category: "Identity",
          description: `Expired passport for ${holder}.`,
          relatedParty: holder,
          sourceDoc: fileName,
          severity: "High",
          rule: "PASSPORT-EXPIRED",
          evidence: `Expiry date ${doc.expiry_date}, today ${now.toISOString().slice(0, 10)}.`,
          recommendedAction: "Request a current passport.",
          status: "Open",
        });
      }
      checklist.push(item);
      if (isPresent(doc.holder_name)) {
        parties.push({
          id: id("rp"),
          name: doc.holder_name,
          role: "Signatory",
          partyType: "Individual",
          nationality: isPresent(doc.nationality) ? doc.nationality : undefined,
          dob: isPresent(doc.date_of_birth) ? doc.date_of_birth : undefined,
        });
        fields.push({
          key: `passport_holder_${docId}`,
          label: "Passport holder",
          value: doc.holder_name,
          source: `From ${fileName}`,
        });
      }
      if (isPresent(doc.document_number)) {
        fields.push({
          key: `passport_number_${docId}`,
          label: "Passport number",
          value: doc.document_number,
          source: `From ${fileName}`,
        });
      }
      messages.push(
        `Identified passport for ${isPresent(doc.holder_name) ? doc.holder_name : "the signatory"}${expiry && expiry < now ? " — expired." : "."}`,
      );
      auditFragments.push(`Passport classified for ${holder}`);
      break;
    }

    case "proof_of_address": {
      const holder = pickName(doc.holder_name, partyName);
      const item = makeItem(
        `Proof of address — ${holder}`,
        "Current residential address evidence",
        "Received",
      );
      const issued = tryDate(doc.issue_date);
      if (issued) {
        const age = now.getTime() - issued.getTime();
        if (age > SIX_MONTHS_MS) {
          item.status = "Attention required";
          const months = Math.round(age / (30 * 24 * 60 * 60 * 1000));
          item.investorIssue = `Document issued ${months} months ago.`;
          item.remedy =
            "Please provide a proof of address issued within the last six months.";
          flags.push({
            id: id("rf"),
            category: "Proof of address",
            description: `POA older than six months for ${holder}.`,
            relatedParty: holder,
            sourceDoc: fileName,
            severity: "Medium",
            rule: "POA-AGE-6M",
            evidence: `Issued ${doc.issue_date} (${months} months ago).`,
            recommendedAction: "Request a current POA dated within 6 months.",
            status: "Open",
          });
        }
      } else {
        item.status = "Attention required";
        item.investorIssue =
          "Could not detect an issue date on the proof of address.";
        item.remedy = "Please upload a POA with a clearly visible issue date.";
      }
      checklist.push(item);
      if (isPresent(doc.address)) {
        fields.push({
          key: `address_${docId}`,
          label: "Residential address",
          value: doc.address,
          source: `From ${fileName}`,
        });
      }
      const note =
        item.status === "Attention required" && item.investorIssue
          ? ` — ${item.investorIssue}`
          : "";
      messages.push(`Identified proof of address for ${holder}${note}`);
      auditFragments.push(`Proof of address classified, status: ${item.status}`);
      break;
    }

    case "certificate_of_incorporation":
    case "certificate_of_formation": {
      const label = humanLabelFor(doc.document_type);
      const item = makeItem(label, "Evidence of entity formation", "Received");
      checklist.push(item);
      if (isPresent(doc.legal_name)) {
        fields.push({
          key: `legal_name`,
          label: "Registered legal name",
          value: doc.legal_name,
          source: `From ${fileName}`,
        });
      }
      if (isPresent(doc.jurisdiction)) {
        fields.push({
          key: `jurisdiction`,
          label: "Jurisdiction",
          value: doc.jurisdiction,
          source: `From ${fileName}`,
        });
      }
      if (isPresent(doc.registration_number)) {
        fields.push({
          key: `registration_number`,
          label: "Registration number",
          value: doc.registration_number,
          source: `From ${fileName}`,
        });
      }
      if (isPresent(doc.incorporation_date)) {
        fields.push({
          key: `incorporation_date`,
          label: "Incorporation date",
          value: doc.incorporation_date,
          source: `From ${fileName}`,
        });
      }
      if (isPresent(c.jurisdiction) && isPresent(doc.jurisdiction)) {
        const a = c.jurisdiction.toLowerCase();
        const b = doc.jurisdiction.toLowerCase();
        if (!a.includes(b) && !b.includes(a)) {
          flags.push({
            id: id("rf"),
            category: "Jurisdiction",
            description: `Certificate jurisdiction (${doc.jurisdiction}) does not match declared jurisdiction (${c.jurisdiction}).`,
            relatedParty: c.investorName,
            sourceDoc: fileName,
            severity: "Medium",
            rule: "JURISDICTION-MISMATCH",
            evidence: `Certificate: ${doc.jurisdiction}. Declared: ${c.jurisdiction}.`,
            recommendedAction: "Confirm correct jurisdiction.",
            status: "Open",
          });
        }
      }
      const subj = isPresent(doc.legal_name) ? doc.legal_name : partyName;
      messages.push(
        `Identified ${label} for ${subj}${isPresent(doc.jurisdiction) ? ` (${doc.jurisdiction})` : ""}.`,
      );
      auditFragments.push(`${label} classified for ${subj}`);
      break;
    }

    case "limited_partnership_agreement": {
      const item = makeItem(
        "Limited Partnership Agreement",
        "Constitutional document for the partnership",
        "Received",
      );
      checklist.push(item);
      if (isPresent(doc.general_partner)) {
        fields.push({
          key: `general_partner`,
          label: "General Partner",
          value: doc.general_partner,
          source: `From ${fileName}`,
        });
        parties.push({
          id: id("rp"),
          name: doc.general_partner,
          role: "General Partner",
          partyType: "Entity",
        });
      }
      messages.push(
        `Identified Limited Partnership Agreement${isPresent(doc.general_partner) ? ` — GP: ${doc.general_partner}` : ""}.`,
      );
      auditFragments.push("LPA classified");
      break;
    }

    case "register_of_members":
    case "register_of_directors": {
      const label = humanLabelFor(doc.document_type);
      checklist.push(makeItem(label, "Identifies persons in control", "Received"));
      for (const h of doc.ownership_holders) {
        const partyType: RelatedParty["partyType"] =
          h.party_type === "Entity" ? "Entity" : "Individual";
        const role = isPresent(h.role)
          ? h.role
          : doc.document_type === "register_of_directors"
            ? "Director"
            : "Member";
        parties.push({
          id: id("rp"),
          name: h.name,
          role,
          partyType,
          ownershipPct: parsePct(h.ownership_pct),
        });
      }
      messages.push(`Identified ${label} (${doc.ownership_holders.length} holders).`);
      auditFragments.push(`${label} classified`);
      break;
    }

    case "articles_of_association": {
      const item = makeItem(
        "Articles of Association",
        "Constitutional document",
        "Received",
      );
      const nonEnglish =
        isPresent(doc.language) && doc.language.toLowerCase() !== "english";
      if (nonEnglish) {
        item.status = "Attention required";
        item.investorIssue = `Document is in ${doc.language}.`;
        item.remedy = "Please provide a certified English translation.";
        flags.push({
          id: id("rf"),
          category: "Translation",
          description: `Articles in ${doc.language} without certified English translation.`,
          relatedParty: c.investorName,
          sourceDoc: fileName,
          severity: "Medium",
          rule: "DOC-LANG-EN",
          evidence: `Document language: ${doc.language}.`,
          recommendedAction: "Obtain certified English translation.",
          status: "Open",
        });
      }
      checklist.push(item);
      messages.push(
        `Identified Articles of Association${nonEnglish ? ` (${doc.language}, translation required)` : ""}.`,
      );
      auditFragments.push("Articles of Association classified");
      break;
    }

    case "pep_declaration": {
      checklist.push(makeItem("PEP declaration", "Investor declaration", "Received"));
      messages.push("PEP declaration received.");
      auditFragments.push("PEP declaration received");
      break;
    }

    case "fatca_declaration": {
      checklist.push(
        makeItem("FATCA / CRS declaration", "Investor declaration", "Received"),
      );
      messages.push("FATCA / CRS declaration received.");
      auditFragments.push("FATCA / CRS declaration received");
      break;
    }

    case "source_of_funds_evidence":
    case "bank_statement": {
      const label = humanLabelFor(doc.document_type);
      checklist.push(
        makeItem(label, "Evidence of the subscription source", "Received"),
      );
      messages.push(`Identified ${label}.`);
      auditFragments.push(`${label} classified`);
      break;
    }

    case "other": {
      // No checklist row — the doc lands in the Unmatched uploads tray.
      // Keep the compliance red flag so reviewers still see it.
      flags.push({
        id: id("rf"),
        category: "Classification",
        description: `Document could not be confidently classified.`,
        relatedParty: partyName,
        sourceDoc: fileName,
        severity: "Low",
        rule: "DOC-UNCLASSIFIED",
        evidence: doc.summary,
        recommendedAction: "Manual review by Compliance team.",
        status: "Open",
      });
      const subtype = isPresent(doc.document_subtype) ? doc.document_subtype : null;
      return {
        classifiedAs: subtype ?? "Uncategorised document",
        party: partyName,
        checklistAdditions: [],
        redFlagAdditions: flags,
        extractedFieldAdditions: [],
        relatedPartyAdditions: [],
        agentMessage: `Received document but couldn't confidently classify it${subtype ? ` (looks like a ${subtype})` : ""}. Open the document checklist to remove it or wait for compliance review.`,
        auditDetail: "Document received but unclassified",
        matchOutcome: "unmatched_unknown_type",
        matchReason: subtype
          ? `Classifier saw it as "${subtype}" but isn't confident enough to slot it.`
          : `Classifier couldn't determine the document type.`,
      };
    }
  }

  lowConfidenceFlag();

  return {
    classifiedAs: humanLabelFor(doc.document_type),
    party: partyName,
    checklistAdditions: checklist,
    redFlagAdditions: flags,
    extractedFieldAdditions: fields,
    relatedPartyAdditions: parties,
    agentMessage: messages.join(" "),
    auditDetail: auditFragments.join("; "),
    matchOutcome: checklist.length > 0 ? "matched" : "unmatched_unknown_type",
  };
}

/** Pure helper exposed for testing — POA age check on its own. */
export function checkPoaAge(
  issueDateIso: string,
  now: Date = new Date(),
): { ok: boolean; ageMonths: number } {
  const issued = tryDate(issueDateIso);
  if (!issued) return { ok: false, ageMonths: -1 };
  const ageMonths = Math.round(dayDiff(now, issued) / 30);
  return { ok: now.getTime() - issued.getTime() <= SIX_MONTHS_MS, ageMonths };
}
