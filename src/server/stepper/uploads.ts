import { createServerFn } from "@tanstack/react-start";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { stepperUploads } from "../db/schema";
import { extractToMarkdown } from "../extraction";
import { classifyDocument } from "../classification";
import { loadCase, persistCase } from "./cases";
import {
  validateStepperDocument,
  buildThumbnailExcerpt,
  recomputeCrossDocFlags,
} from "./validator";
import { flatRequirements } from "@/lib/stepper/requirements";
import type {
  StepperCase,
  StepperUploadedDocument,
  StepperAuditEvent,
  ProcessingPhase,
} from "@/lib/stepper/types";

const SUPPORTED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;

function uploadDir(): string {
  return process.env.UPLOAD_DIR
    ? path.join(process.env.UPLOAD_DIR, "stepper")
    : path.join(process.cwd(), "uploads", "stepper");
}

function inferMime(fileName: string, fallback: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[ext] ?? fallback;
}

const t = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

/** Numeric rank for confidence comparisons. Missing/unknown ranks below "low". */
function confidenceRank(conf: string | null | undefined): number {
  if (conf === "high") return 3;
  if (conf === "medium") return 2;
  if (conf === "low") return 1;
  return 0;
}

async function setPhase(docId: string, phase: ProcessingPhase, extra: Partial<{ error: string }> = {}) {
  await db
    .update(stepperUploads)
    .set({ processingPhase: phase, ...(extra.error ? { error: extra.error } : {}) })
    .where(eq(stepperUploads.id, docId));
}

interface ProcessOpts {
  caseId: string;
  /** When provided, replace any existing checklist + upload for this requirement key. */
  targetRequirementKey?: string;
}

/**
 * Run the full pipeline for a single file against an already-loaded case.
 * Mutates the case in memory; the caller is responsible for persisting at the end.
 */
async function processFile(c: StepperCase, file: File, opts: ProcessOpts): Promise<StepperCase> {
  const docId = randomUUID();
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
  const caseDir = path.join(uploadDir(), c.caseId);
  await mkdir(caseDir, { recursive: true });
  const storagePath = path.join(caseDir, `${docId}-${safeName}`);
  const mimeType = inferMime(file.name, file.type || "application/octet-stream");
  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");

  // Dedup: if the same bytes were already processed successfully on this case,
  // we either skip (bulk upload — user didn't pick a slot) or re-route the
  // existing copy to the slot they explicitly chose. Re-routing is the recovery
  // path when the classifier misfiled a doc and the user is dropping the same
  // file onto the correct slot from the unmatched banner / Replace button.
  const dup = c.uploadedDocuments.find((d) => d.sha256 === sha256 && d.status === "ready");
  if (dup) {
    const target = opts.targetRequirementKey;
    if (!target) {
      return {
        ...c,
        audit: [
          ...c.audit,
          { id: id("au"), at: t(), actor: "System", type: "Duplicate ignored", detail: `${file.name} matches an existing upload (${dup.fileName}).` },
        ],
        agentStatus: `Skipped ${file.name} — same file is already uploaded. Use the Replace button on the slot you want it in.`,
        lastSavedAt: t(),
      };
    }

    // Re-route the existing dup: drop its prior checklist entries (which may
    // sit on the wrong slot), assign it to the target slot, and update its
    // matched-keys on the upload row. We also override the displayed
    // `classifiedAs` + confidence to reflect the investor's explicit choice —
    // showing the stale classifier guess ("Authorised signatory list ·
    // medium") on a slot the investor manually assigned to "Government-issued
    // photo ID" is confusing and undermines the override.
    const partyName = c.profile?.investorName ?? "Investor";
    const targetReq = flatRequirements(c.profile!.legalForm).find((r) => r.key === target);
    const overriddenLabel = targetReq?.name ?? dup.classifiedAs;
    const movedExtractedFields = {
      ...(dup.extractedFields ?? {}),
      _assignedManually: "true",
      _originalClassifiedAs: dup.classifiedAs,
      ...(dup.classificationConfidence
        ? { _originalConfidence: dup.classificationConfidence }
        : {}),
    };
    const movedDoc: StepperUploadedDocument = {
      ...dup,
      classifiedAs: overriddenLabel,
      classificationConfidence: "high",
      matchedRequirementKeys: [target],
      extractedFields: movedExtractedFields,
    };
    await db
      .update(stepperUploads)
      .set({
        classifiedAs: overriddenLabel,
        classificationConfidence: "high",
        matchedRequirementKeys: [target],
        extractedFields: movedExtractedFields,
      })
      .where(eq(stepperUploads.id, dup.id));

    const survivingChecklist = c.checklist.filter(
      (i) => i.sourceDocId !== dup.id && i.requirementKey !== target,
    );
    const newChecklistItem = {
      id: id("cl"),
      requirementKey: target,
      name: targetReq?.name ?? target,
      party: partyName,
      reason: targetReq?.note ?? "Manually assigned by investor",
      status: "received" as const,
      receivedAt: t(),
      sourceDocId: dup.id,
    };
    const uploadedDocuments = c.uploadedDocuments.map((u) => (u.id === dup.id ? movedDoc : u));

    return {
      ...c,
      uploadedDocuments,
      checklist: [...survivingChecklist, newChecklistItem],
      audit: [
        ...c.audit,
        { id: id("au"), at: t(), actor: "System", type: "Document moved", detail: `Moved ${dup.fileName} into the ${target} slot (same file was already uploaded).` },
      ],
      agentStatus: `Moved ${dup.fileName} into the slot you chose.`,
      lastSavedAt: t(),
    };
  }

  await writeFile(storagePath, buf);
  const receivedAt = t();

  await db.insert(stepperUploads).values({
    id: docId,
    caseId: c.caseId,
    fileName: file.name,
    mimeType,
    byteSize: buf.byteLength,
    classifiedAs: "Pending",
    receivedAt,
    storagePath,
    status: "extracting",
    matchedRequirementKeys: [],
    sha256,
    processingPhase: "reading",
  });

  const inFlight: StepperUploadedDocument = {
    id: docId,
    fileName: file.name,
    mimeType,
    byteSize: buf.byteLength,
    classifiedAs: "Pending",
    receivedAt,
    status: "extracting",
    matchedRequirementKeys: [],
    extractedFields: {},
    sha256,
    processingPhase: "reading",
  };
  // Insert the in-flight upload so the client polling can see it immediately.
  c = {
    ...c,
    uploadedDocuments: [...c.uploadedDocuments, inFlight],
    agentStatus: `Reading ${file.name}…`,
    lastSavedAt: receivedAt,
  };
  // Persist this in-flight insert so the polling client picks it up.
  await persistCase(c);

  if (!SUPPORTED_MIME.has(mimeType)) {
    const errorMsg = `Unsupported file type "${mimeType}". Upload PDF or image (PNG, JPEG, WebP, GIF).`;
    await setPhase(docId, "failed", { error: errorMsg });
    return {
      ...c,
      uploadedDocuments: c.uploadedDocuments.map((u) =>
        u.id === docId ? { ...u, status: "failed", error: errorMsg, classifiedAs: "Unsupported", processingPhase: "failed" } : u,
      ),
      audit: [
        ...c.audit,
        { id: id("au"), at: receivedAt, actor: "System", type: "Upload rejected", detail: `${file.name}: ${errorMsg}` } satisfies StepperAuditEvent,
      ],
      agentStatus: `Could not process ${file.name}: ${errorMsg}`,
      lastSavedAt: receivedAt,
    };
  }

  try {
    const markdown = await extractToMarkdown({ fileBytes: buf, mimeType, fileName: file.name });
    const mdPath = path.join(caseDir, `${docId}.md`);
    await writeFile(mdPath, markdown, "utf8");

    // Phase: classifying
    await setPhase(docId, "classifying");
    c = {
      ...c,
      uploadedDocuments: c.uploadedDocuments.map((u) => (u.id === docId ? { ...u, processingPhase: "classifying" } : u)),
      agentStatus: `Classifying ${file.name}…`,
      lastSavedAt: t(),
    };
    await persistCase(c);

    const classified = await classifyDocument({ markdown, fileName: file.name });
    const partyName = c.profile?.investorName ?? "Investor";

    // Phase: matching
    await setPhase(docId, "matching");
    c = {
      ...c,
      uploadedDocuments: c.uploadedDocuments.map((u) => (u.id === docId ? { ...u, processingPhase: "matching" } : u)),
      agentStatus: `Matching ${file.name} to your checklist…`,
      lastSavedAt: t(),
    };
    await persistCase(c);

    const result = validateStepperDocument({
      legalForm: c.profile!.legalForm,
      classified,
      docId,
      fileName: file.name,
      partyName,
      targetRequirementKey: opts.targetRequirementKey,
    });

    // When replacing a specific slot, restrict matched-keys to the target requirement.
    let matchedRequirementKeys = result.matchedRequirementKeys;
    let checklistAdditions = result.checklistAdditions;
    if (opts.targetRequirementKey) {
      matchedRequirementKeys = matchedRequirementKeys.filter((k) => k === opts.targetRequirementKey);
      checklistAdditions = checklistAdditions.filter((item) => item.requirementKey === opts.targetRequirementKey);
    } else {
      // Confidence-aware "latest wins": don't let a medium- or low-confidence
      // match silently kick out a high-confidence existing match. Two failure
      // modes this guards against: ambiguous docs the classifier is unsure
      // about, and the OCR coming back with shape-keywords that match a
      // different requirement than the doc's actual purpose. The doc still
      // lands in the case — it just shows up in the unmatched banner so the
      // investor can decide which slot it really belongs in.
      const blockedKeys: string[] = [];
      matchedRequirementKeys = matchedRequirementKeys.filter((key) => {
        const existing = c.uploadedDocuments.find(
          (u) =>
            u.status === "ready" &&
            u.id !== docId &&
            u.matchedRequirementKeys.includes(key),
        );
        if (!existing) return true;
        if (confidenceRank(existing.classificationConfidence) > confidenceRank(classified.confidence)) {
          blockedKeys.push(key);
          return false;
        }
        return true;
      });
      checklistAdditions = checklistAdditions.filter((item) => matchedRequirementKeys.includes(item.requirementKey));
      if (blockedKeys.length > 0) {
        // Surface why this doc didn't slot — the user sees the existing
        // high-confidence doc was kept and can flip them via the unmatched
        // banner if the classifier got the new doc right after all.
        result.auditDetail = `${file.name} read as ${result.classifiedAs} (confidence ${classified.confidence}), but a higher-confidence document already fills ${blockedKeys.join(", ")}. Kept the existing match.`;
        result.agentMessage = `Kept the existing higher-confidence document in the ${blockedKeys.join(", ")} slot. ${file.name} is in the unmatched banner — drop it onto the right slot if the agent's first guess was wrong.`;
      }
    }

    const thumbnailExcerpt = buildThumbnailExcerpt({ classified, fileName: file.name });

    // When the investor explicitly chose the slot (Replace / Assign-to-slot),
    // override the displayed label + confidence with the slot's identity so
    // the UI doesn't keep showing the classifier's wrong guess ("Authorised
    // signatory list · medium") on a slot the user manually overrode.
    let finalClassifiedAs = result.classifiedAs;
    let finalConfidence: "low" | "medium" | "high" = classified.confidence;
    let finalExtractedFields = result.extractedFields;
    if (opts.targetRequirementKey && matchedRequirementKeys.includes(opts.targetRequirementKey)) {
      const targetReq = flatRequirements(c.profile!.legalForm).find(
        (r) => r.key === opts.targetRequirementKey,
      );
      if (targetReq) {
        finalClassifiedAs = targetReq.name;
        finalConfidence = "high";
        finalExtractedFields = {
          ...finalExtractedFields,
          _assignedManually: "true",
          _originalClassifiedAs: result.classifiedAs,
          _originalConfidence: classified.confidence,
        };
      }
    }

    await db
      .update(stepperUploads)
      .set({
        classifiedAs: finalClassifiedAs,
        status: "ready",
        markdownPath: mdPath,
        extractedFields: finalExtractedFields,
        matchedRequirementKeys,
        classificationConfidence: finalConfidence,
        processingPhase: "ready",
        thumbnailExcerpt,
      })
      .where(eq(stepperUploads.id, docId));

    const uploaded: StepperUploadedDocument = {
      ...inFlight,
      classifiedAs: finalClassifiedAs,
      status: "ready",
      matchedRequirementKeys,
      extractedFields: finalExtractedFields,
      classificationConfidence: finalConfidence,
      processingPhase: "ready",
      thumbnailExcerpt,
    };

    // Replace older items targeting the same requirement keys (latest wins).
    const newReqKeys = new Set(matchedRequirementKeys);
    const survivingChecklist = c.checklist.filter((i) => !newReqKeys.has(i.requirementKey));

    // For an explicit slot replace, also drop the prior file from uploadedDocuments.
    let uploadedDocuments = c.uploadedDocuments;
    if (opts.targetRequirementKey) {
      uploadedDocuments = uploadedDocuments.filter(
        (u) => u.id === docId || !u.matchedRequirementKeys.includes(opts.targetRequirementKey!),
      );
    }
    uploadedDocuments = uploadedDocuments.map((u) => (u.id === docId ? uploaded : u));

    c = {
      ...c,
      uploadedDocuments,
      checklist: [...survivingChecklist, ...checklistAdditions],
      audit: [
        ...c.audit,
        { id: id("au"), at: receivedAt, actor: "System", type: "Document processed", detail: result.auditDetail } satisfies StepperAuditEvent,
      ],
      agentStatus: result.agentMessage || `Matched ${file.name} to the checklist.`,
      lastSavedAt: t(),
    };

    // Cross-document name consistency check.
    c = { ...c, crossDocFlags: recomputeCrossDocFlags(c.uploadedDocuments) };

    return c;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await setPhase(docId, "failed", { error: errMsg });
    return {
      ...c,
      uploadedDocuments: c.uploadedDocuments.map((u) =>
        u.id === docId ? { ...u, status: "failed", error: errMsg, classifiedAs: "Processing failed", processingPhase: "failed" } : u,
      ),
      audit: [
        ...c.audit,
        { id: id("au"), at: receivedAt, actor: "System", type: "Upload failed", detail: `${file.name}: ${errMsg}` } satisfies StepperAuditEvent,
      ],
      agentStatus: `Couldn't process ${file.name}: ${errMsg}`,
      lastSavedAt: t(),
    };
  }
}

export const uploadStepperDocuments = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<StepperCase> => {
    const caseId = String(data.get("caseId") ?? "");
    if (!caseId) throw new Error("caseId is required");
    const targetRequirementKey = data.get("requirementKey")?.toString() || undefined;

    const files = data.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new Error("No files uploaded");
    if (files.length > MAX_FILES_PER_REQUEST) {
      throw new Error(`Too many files (${files.length}). Max ${MAX_FILES_PER_REQUEST} per request.`);
    }
    const oversized = files.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) {
      const mb = Math.round(oversized.size / (1024 * 1024));
      throw new Error(`File "${oversized.name}" is ${mb} MB, exceeds ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB limit.`);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
    }

    let c = await loadCase(caseId);
    if (!c.profile) throw new Error("Complete the Profile step before uploading documents");

    for (const file of files) {
      c = await processFile(c, file, { caseId, targetRequirementKey });
    }

    return await persistCase(c);
  });

export const replaceRequirement = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<StepperCase> => {
    const caseId = String(data.get("caseId") ?? "");
    const requirementKey = String(data.get("requirementKey") ?? "");
    if (!caseId) throw new Error("caseId is required");
    if (!requirementKey) throw new Error("requirementKey is required");

    const files = data.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length !== 1) throw new Error("Replace expects exactly one file");

    let c = await loadCase(caseId);
    if (!c.profile) throw new Error("Complete the Profile step before uploading documents");

    // Remove existing storage for the same requirement, so we don't accumulate stale files.
    const replacedDocs = c.uploadedDocuments.filter((d) => d.matchedRequirementKeys.includes(requirementKey));
    for (const old of replacedDocs) {
      const row = await db.select().from(stepperUploads).where(eq(stepperUploads.id, old.id));
      if (row[0]) {
        try { await unlink(row[0].storagePath); } catch { /* swallow */ }
        if (row[0].markdownPath) try { await unlink(row[0].markdownPath); } catch { /* swallow */ }
        await db.delete(stepperUploads).where(eq(stepperUploads.id, old.id));
      }
    }

    c = await processFile(c, files[0], { caseId, targetRequirementKey: requirementKey });
    return await persistCase(c);
  });

export interface StepperFilePayload {
  fileName: string;
  mimeType: string;
  base64: string;
}

export const getStepperFile = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<StepperFilePayload> => {
    const rows = await db.select().from(stepperUploads).where(eq(stepperUploads.id, data.id));
    if (rows.length === 0) throw new Error("File not found");
    const row = rows[0];
    const bytes = await readFile(row.storagePath);
    return { fileName: row.fileName, mimeType: row.mimeType, base64: bytes.toString("base64") };
  });

export interface StepperMarkdownPayload {
  fileName: string;
  markdown: string;
  /** True when the row had no extracted markdown yet (extraction still pending or failed). */
  missing: boolean;
}

/**
 * Returns the extracted markdown for a stepper upload. Used by the
 * Documents step's viewer dialog to show the agent's reading of the file.
 */
export const getStepperMarkdown = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<StepperMarkdownPayload> => {
    const rows = await db.select().from(stepperUploads).where(eq(stepperUploads.id, data.id));
    if (rows.length === 0) throw new Error("File not found");
    const row = rows[0];
    if (!row.markdownPath) {
      return { fileName: row.fileName, markdown: "", missing: true };
    }
    try {
      const buf = await readFile(row.markdownPath, "utf8");
      return { fileName: row.fileName, markdown: buf, missing: false };
    } catch {
      return { fileName: row.fileName, markdown: "", missing: true };
    }
  });
