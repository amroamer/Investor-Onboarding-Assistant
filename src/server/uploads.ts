import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { uploadedDocuments } from "./db/schema";
import { extractToMarkdown } from "./extraction";
import { classifyDocument, type ClassifiedDoc } from "./classification";
import { validateDocument } from "./validation";
import { loadCaseByCaseId, persistCase } from "./cases";
import { syncNamesToScreen } from "./screening";
import { agentMsg } from "@/lib/onboarding/engine";
import type {
  OnboardingCase,
  UploadedDocument,
  AuditEvent,
  LegalForm,
} from "@/lib/onboarding/types";

function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

const SUPPORTED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_BYTES = 32 * 1024 * 1024; // 32 MB — matches Claude PDF input limit
const MAX_FILES_PER_REQUEST = 10;

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

export const uploadDocuments = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<OnboardingCase> => {
    const caseId = String(data.get("caseId") ?? "");
    if (!caseId) throw new Error("caseId is required");

    const files = data.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new Error("No files uploaded");
    if (files.length > MAX_FILES_PER_REQUEST) {
      throw new Error(`Too many files (${files.length}). Please upload at most ${MAX_FILES_PER_REQUEST} files per request.`);
    }
    const oversized = files.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) {
      const mb = Math.round(oversized.size / (1024 * 1024));
      throw new Error(`File "${oversized.name}" is ${mb} MB, which exceeds the ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB limit.`);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
    }

    const { key, case: loaded } = await loadCaseByCaseId(caseId);
    let c = loaded;

    const caseDir = path.join(uploadDir(), caseId);
    await mkdir(caseDir, { recursive: true });

    for (const file of files) {
      const docId = randomUUID();
      const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
      const storagePath = path.join(caseDir, `${docId}-${safeName}`);
      const mimeType = inferMime(file.name, file.type || "application/octet-stream");
      const buf = Buffer.from(await file.arrayBuffer());
      await writeFile(storagePath, buf);
      const receivedAt = new Date().toISOString();

      await db.insert(uploadedDocuments).values({
        id: docId,
        caseId,
        fileName: file.name,
        mimeType,
        byteSize: buf.byteLength,
        classifiedAs: "Pending",
        party: "Investor",
        receivedAt,
        storagePath,
        extractionStatus: "extracting",
        mappedChecklistIds: [],
      });

      if (!SUPPORTED_MIME.has(mimeType)) {
        const errorMsg = `Unsupported file type "${mimeType}". Please upload PDF or image (PNG, JPEG, WebP, GIF).`;
        await db
          .update(uploadedDocuments)
          .set({ extractionStatus: "failed", extractionError: errorMsg })
          .where(eq(uploadedDocuments.id, docId));
        c = {
          ...c,
          uploadedDocuments: [
            ...c.uploadedDocuments,
            {
              id: docId,
              fileName: file.name,
              classifiedAs: "Unsupported",
              party: "Investor",
              receivedAt,
              mappedChecklistIds: [],
            },
          ],
          conversation: [
            ...c.conversation,
            agentMsg(`⚠️ **${file.name}** could not be processed: ${errorMsg}`),
          ],
        };
        continue;
      }

      try {
        const markdown = await extractToMarkdown({
          fileBytes: buf,
          mimeType,
          fileName: file.name,
        });
        const mdPath = path.join(caseDir, `${docId}.md`);
        await writeFile(mdPath, markdown, "utf8");

        const classified = await classifyDocument({ markdown, fileName: file.name });
        const result = validateDocument(c, classified, docId, file.name);

        await db
          .update(uploadedDocuments)
          .set({
            classifiedAs: result.classifiedAs,
            party: result.party,
            extractionStatus: "ready",
            extractedFields: classified,
            markdownPath: mdPath,
            mappedChecklistIds: result.checklistAdditions.map((i) => i.id),
            matchOutcome: result.matchOutcome,
            matchReason: result.matchReason ?? null,
            suggestedLegalForm: result.suggestedLegalForm ?? null,
            classificationConfidence: classified.confidence,
          })
          .where(eq(uploadedDocuments.id, docId));

        const uploadedDoc: UploadedDocument = {
          id: docId,
          fileName: file.name,
          classifiedAs: result.classifiedAs,
          party: result.party,
          receivedAt,
          mappedChecklistIds: result.checklistAdditions.map((i) => i.id),
          matchOutcome: result.matchOutcome,
          matchReason: result.matchReason,
          suggestedLegalForm: result.suggestedLegalForm,
          classificationConfidence: classified.confidence,
        };

        const newAudit: AuditEvent = {
          id: `au_${randomUUID().slice(0, 8)}`,
          at: receivedAt,
          actor: "Agent",
          type: "Document processed",
          detail: result.auditDetail,
        };

        c = {
          ...c,
          uploadedDocuments: [...c.uploadedDocuments, uploadedDoc],
          checklist: [...c.checklist, ...result.checklistAdditions],
          relatedParties: [...c.relatedParties, ...result.relatedPartyAdditions],
          extractedFields: [...c.extractedFields, ...result.extractedFieldAdditions],
          complianceOnly: {
            ...c.complianceOnly,
            redFlags: [...c.complianceOnly.redFlags, ...result.redFlagAdditions],
          },
          audit: [...c.audit, newAudit],
          conversation: [
            ...c.conversation,
            agentMsg(`📄 **${file.name}** — ${result.agentMessage}`),
          ],
          stageStatus: {
            ...c.stageStatus,
            Documents: result.redFlagAdditions.some((f) => f.severity !== "Low")
              ? "Action required"
              : c.checklist.length === 0
              ? "In progress"
              : c.stageStatus.Documents,
          },
        };
        // Promote new related parties into namesToScreen so compliance can run screening.
        c = syncNamesToScreen(c);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db
          .update(uploadedDocuments)
          .set({ extractionStatus: "failed", extractionError: errMsg })
          .where(eq(uploadedDocuments.id, docId));
        c = {
          ...c,
          uploadedDocuments: [
            ...c.uploadedDocuments,
            {
              id: docId,
              fileName: file.name,
              classifiedAs: "Processing failed",
              party: "Investor",
              receivedAt,
              mappedChecklistIds: [],
            },
          ],
          conversation: [
            ...c.conversation,
            agentMsg(`⚠️ **${file.name}** could not be processed: ${errMsg}`),
          ],
        };
      }
    }

    return await persistCase(key, c);
  });

export interface FilePayload {
  fileName: string;
  mimeType: string;
  base64: string;
}

export const getFile = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d as { id: string })
  .handler(async (ctx): Promise<FilePayload> => {
    const { id } = ctx.data as { id: string };
    const rows = await db
      .select()
      .from(uploadedDocuments)
      .where(eq(uploadedDocuments.id, id));
    if (rows.length === 0) throw new Error("File not found");
    const row = rows[0];
    const bytes = await readFile(row.storagePath);
    return {
      fileName: row.fileName,
      mimeType: row.mimeType,
      base64: bytes.toString("base64"),
    };
  });

export interface MarkdownPayload {
  fileName: string;
  markdown: string | null;
  status: string;
  error: string | null;
}

export const getFileMarkdown = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d as { id: string })
  .handler(async (ctx): Promise<MarkdownPayload> => {
    const { id } = ctx.data as { id: string };
    const rows = await db
      .select()
      .from(uploadedDocuments)
      .where(eq(uploadedDocuments.id, id));
    if (rows.length === 0) throw new Error("File not found");
    const row = rows[0];
    const markdown = row.markdownPath ? await readFile(row.markdownPath, "utf8") : null;
    return {
      fileName: row.fileName,
      markdown,
      status: row.extractionStatus,
      error: row.extractionError,
    };
  });

/**
 * Remove an uploaded document from a case. Used by the Unmatched uploads tray
 * (and any future "delete" affordance). Cleans up the DB row, the on-disk
 * file and markdown, drops any checklist items sourced from this doc, and
 * removes red flags that point at it. Related parties and screened names are
 * preserved — they may have been confirmed by the investor.
 */
export const removeDocument = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; docId: string }) => d as { caseId: string; docId: string })
  .handler(async ({ data }): Promise<OnboardingCase> => {
    const { caseId, docId } = data;
    const { key, case: loaded } = await loadCaseByCaseId(caseId);

    const doc = loaded.uploadedDocuments.find((d) => d.id === docId);
    if (!doc) throw new Error("Document not found on this case");

    // Best-effort file cleanup
    const rows = await db
      .select()
      .from(uploadedDocuments)
      .where(eq(uploadedDocuments.id, docId));
    for (const row of rows) {
      try { await unlink(row.storagePath); } catch { /* file may already be gone */ }
      if (row.markdownPath) {
        try { await unlink(row.markdownPath); } catch { /* idem */ }
      }
    }
    await db.delete(uploadedDocuments).where(eq(uploadedDocuments.id, docId));

    const at = new Date().toISOString();
    const c: OnboardingCase = {
      ...loaded,
      uploadedDocuments: loaded.uploadedDocuments.filter((d) => d.id !== docId),
      checklist: loaded.checklist.filter((i) => i.sourceDocId !== docId),
      extractedFields: loaded.extractedFields.filter(
        (f) => !f.source || !f.source.includes(doc.fileName),
      ),
      complianceOnly: {
        ...loaded.complianceOnly,
        redFlags: loaded.complianceOnly.redFlags.filter(
          (f) => f.sourceDoc !== doc.fileName,
        ),
      },
      audit: [
        ...loaded.audit,
        {
          id: `au_${randomUUID().slice(0, 8)}`,
          at,
          actor: "Investor",
          type: "Document removed",
          detail: `Removed ${doc.fileName}`,
        } satisfies AuditEvent,
      ],
      conversation: [
        ...loaded.conversation,
        agentMsg(`🗑️ **${doc.fileName}** removed from this case.`),
      ],
    };

    return await persistCase(key, c);
  });

/**
 * Switch the case's legal form and re-evaluate every uploaded document
 * against the new form. Used when an investor responds to a wrong-form
 * mismatch in the Unmatched uploads tray by clicking "Switch to {form}".
 *
 * The case's doc-derived state (checklist, related parties, extracted
 * fields, classification red flags) is reset and rebuilt from the stored
 * ClassifiedDoc on each upload. Investor-confirmed state (ownership,
 * PEP/FATCA confirmations, screening names) is preserved.
 */
export const switchLegalForm = createServerFn({ method: "POST" })
  .validator(
    (d: { caseId: string; legalForm: LegalForm }) =>
      d as { caseId: string; legalForm: LegalForm },
  )
  .handler(async ({ data }): Promise<OnboardingCase> => {
    const { caseId, legalForm } = data;
    const { key, case: loaded } = await loadCaseByCaseId(caseId);

    const previousForm = loaded.legalForm;
    if (previousForm === legalForm) return loaded;

    // Re-validate every doc against the new form. Pull stored ClassifiedDoc
    // from the uploaded_documents table — no re-call to Claude required.
    const rows = await db
      .select()
      .from(uploadedDocuments)
      .where(eq(uploadedDocuments.caseId, caseId));

    // Reset doc-derived state, but keep investor-confirmed state intact.
    // Red flags raised by classification/validation are rebuilt; all other
    // red flag categories (e.g. screening hits) are preserved.
    const preservedFlags = loaded.complianceOnly.redFlags.filter(
      (f) =>
        f.rule !== "CLS-LOW-CONFIDENCE" &&
        f.rule !== "DOC-UNCLASSIFIED" &&
        f.category !== "Identity" &&
        f.category !== "Proof of address" &&
        f.category !== "Translation" &&
        f.category !== "Jurisdiction",
    );

    let c: OnboardingCase = {
      ...loaded,
      legalForm,
      checklist: [],
      relatedParties: [],
      extractedFields: [],
      complianceOnly: {
        ...loaded.complianceOnly,
        redFlags: preservedFlags,
      },
    };

    const updatedDocs: UploadedDocument[] = [];
    for (const row of rows) {
      if (row.extractionStatus !== "ready" || !row.extractedFields) {
        // Couldn't be re-classified — preserve the doc row as-is.
        const existing = loaded.uploadedDocuments.find((d) => d.id === row.id);
        if (existing) updatedDocs.push(existing);
        continue;
      }
      const classified = row.extractedFields as ClassifiedDoc;
      const result = validateDocument(c, classified, row.id, row.fileName);

      await db
        .update(uploadedDocuments)
        .set({
          classifiedAs: result.classifiedAs,
          party: result.party,
          mappedChecklistIds: result.checklistAdditions.map((i) => i.id),
          matchOutcome: result.matchOutcome,
          matchReason: result.matchReason ?? null,
          suggestedLegalForm: result.suggestedLegalForm ?? null,
        })
        .where(eq(uploadedDocuments.id, row.id));

      updatedDocs.push({
        id: row.id,
        fileName: row.fileName,
        classifiedAs: result.classifiedAs,
        party: result.party,
        receivedAt: row.receivedAt,
        mappedChecklistIds: result.checklistAdditions.map((i) => i.id),
        matchOutcome: result.matchOutcome,
        matchReason: result.matchReason,
        suggestedLegalForm: result.suggestedLegalForm,
        classificationConfidence: classified.confidence,
      });

      c = {
        ...c,
        checklist: [...c.checklist, ...result.checklistAdditions],
        relatedParties: [...c.relatedParties, ...result.relatedPartyAdditions],
        extractedFields: [...c.extractedFields, ...result.extractedFieldAdditions],
        complianceOnly: {
          ...c.complianceOnly,
          redFlags: [...c.complianceOnly.redFlags, ...result.redFlagAdditions],
        },
      };
    }

    c.uploadedDocuments = updatedDocs;
    c = syncNamesToScreen(c);

    const at = new Date().toISOString();
    c = {
      ...c,
      audit: [
        ...c.audit,
        {
          id: `au_${randomUUID().slice(0, 8)}`,
          at,
          actor: "Investor",
          type: "Legal form changed",
          detail: `Onboarding type switched from ${previousForm ?? "unset"} to ${legalForm}. ${updatedDocs.length} document(s) re-evaluated.`,
        } satisfies AuditEvent,
      ],
      conversation: [
        ...c.conversation,
        agentMsg(
          `Onboarding type switched to **${legalForm}**. I re-checked your uploaded documents against the new checklist.`,
        ),
      ],
    };

    return await persistCase(key, c);
  });
