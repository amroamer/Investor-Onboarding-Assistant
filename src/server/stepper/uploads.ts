import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { stepperUploads } from "../db/schema";
import { extractToMarkdown } from "../extraction";
import { classifyDocument } from "../classification";
import { loadCase, persistCase } from "./cases";
import { validateStepperDocument } from "./validator";
import type {
  StepperCase,
  StepperUploadedDocument,
  StepperAuditEvent,
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

export const uploadStepperDocuments = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<StepperCase> => {
    const caseId = String(data.get("caseId") ?? "");
    if (!caseId) throw new Error("caseId is required");

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

    const caseDir = path.join(uploadDir(), caseId);
    await mkdir(caseDir, { recursive: true });

    for (const file of files) {
      const docId = randomUUID();
      const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
      const storagePath = path.join(caseDir, `${docId}-${safeName}`);
      const mimeType = inferMime(file.name, file.type || "application/octet-stream");
      const buf = Buffer.from(await file.arrayBuffer());
      await writeFile(storagePath, buf);
      const receivedAt = t();

      await db.insert(stepperUploads).values({
        id: docId,
        caseId,
        fileName: file.name,
        mimeType,
        byteSize: buf.byteLength,
        classifiedAs: "Pending",
        receivedAt,
        storagePath,
        status: "extracting",
        matchedRequirementKeys: [],
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
      };

      if (!SUPPORTED_MIME.has(mimeType)) {
        const errorMsg = `Unsupported file type "${mimeType}". Upload PDF or image (PNG, JPEG, WebP, GIF).`;
        await db
          .update(stepperUploads)
          .set({ status: "failed", error: errorMsg })
          .where(eq(stepperUploads.id, docId));
        c = {
          ...c,
          uploadedDocuments: [
            ...c.uploadedDocuments,
            { ...inFlight, status: "failed", error: errorMsg, classifiedAs: "Unsupported" },
          ],
          audit: [
            ...c.audit,
            {
              id: id("au"),
              at: receivedAt,
              actor: "System",
              type: "Upload rejected",
              detail: `${file.name}: ${errorMsg}`,
            } satisfies StepperAuditEvent,
          ],
          lastSavedAt: receivedAt,
        };
        continue;
      }

      try {
        const markdown = await extractToMarkdown({ fileBytes: buf, mimeType, fileName: file.name });
        const mdPath = path.join(caseDir, `${docId}.md`);
        await writeFile(mdPath, markdown, "utf8");

        const classified = await classifyDocument({ markdown, fileName: file.name });
        const partyName = c.profile!.investorName;
        const result = validateStepperDocument({
          legalForm: c.profile!.legalForm,
          classified,
          docId,
          fileName: file.name,
          partyName,
        });

        await db
          .update(stepperUploads)
          .set({
            classifiedAs: result.classifiedAs,
            status: "ready",
            markdownPath: mdPath,
            extractedFields: result.extractedFields,
            matchedRequirementKeys: result.matchedRequirementKeys,
            classificationConfidence: classified.confidence,
          })
          .where(eq(stepperUploads.id, docId));

        const uploaded: StepperUploadedDocument = {
          ...inFlight,
          classifiedAs: result.classifiedAs,
          status: "ready",
          matchedRequirementKeys: result.matchedRequirementKeys,
          extractedFields: result.extractedFields,
          classificationConfidence: classified.confidence,
        };

        // Replace existing checklist items that target the same requirement
        // — newer upload supersedes older for the same key.
        const newReqKeys = new Set(result.matchedRequirementKeys);
        const survivingChecklist = c.checklist.filter((i) => !newReqKeys.has(i.requirementKey));

        c = {
          ...c,
          uploadedDocuments: [...c.uploadedDocuments, uploaded],
          checklist: [...survivingChecklist, ...result.checklistAdditions],
          audit: [
            ...c.audit,
            {
              id: id("au"),
              at: receivedAt,
              actor: "System",
              type: "Document processed",
              detail: result.auditDetail,
            } satisfies StepperAuditEvent,
          ],
          lastSavedAt: receivedAt,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await db
          .update(stepperUploads)
          .set({ status: "failed", error: errMsg })
          .where(eq(stepperUploads.id, docId));
        c = {
          ...c,
          uploadedDocuments: [
            ...c.uploadedDocuments,
            { ...inFlight, status: "failed", error: errMsg, classifiedAs: "Processing failed" },
          ],
          audit: [
            ...c.audit,
            {
              id: id("au"),
              at: receivedAt,
              actor: "System",
              type: "Upload failed",
              detail: `${file.name}: ${errMsg}`,
            } satisfies StepperAuditEvent,
          ],
          lastSavedAt: receivedAt,
        };
      }
    }

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
