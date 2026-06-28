import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const cases = pgTable("cases", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  investorName: text("investor_name").notNull(),
  primaryContact: text("primary_contact").notNull(),
  currentStage: text("current_stage").notNull(),
  progressPct: integer("progress_pct").notNull().default(0),
  data: jsonb("data").notNull(),
  complianceOnly: jsonb("compliance_only").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
  lastSavedAt: timestamp("last_saved_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true, mode: "string" }).notNull(),
  actor: text("actor").notNull(),
  type: text("type").notNull(),
  detail: text("detail").notNull(),
});

export const uploadedDocuments = pgTable("uploaded_documents", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  byteSize: integer("byte_size").notNull().default(0),
  classifiedAs: text("classified_as").notNull(),
  party: text("party").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull(),
  storagePath: text("storage_path").notNull(),
  markdownPath: text("markdown_path"),
  extractionStatus: text("extraction_status").notNull().default("pending"),
  extractionError: text("extraction_error"),
  extractedFields: jsonb("extracted_fields"),
  mappedChecklistIds: text("mapped_checklist_ids").array().notNull().default([]),
  matchOutcome: text("match_outcome").notNull().default("matched"),
  matchReason: text("match_reason"),
  suggestedLegalForm: text("suggested_legal_form"),
  classificationConfidence: text("classification_confidence"),
});

export type CaseRow = typeof cases.$inferSelect;
export type CaseInsert = typeof cases.$inferInsert;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type UploadedDocumentRow = typeof uploadedDocuments.$inferSelect;

/* ─── Stepper (v2) tables ───────────────────────────────────────────────
 * Fully isolated from the conversational flow above. The stepper has its
 * own case shape, its own uploads (different storage layout) and its own
 * audit log. Do not cross-reference these tables with `cases`.
 */

export const stepperCases = pgTable("stepper_cases", {
  id: text("id").primaryKey(),
  investorName: text("investor_name").notNull().default(""),
  primaryContact: text("primary_contact").notNull().default(""),
  primaryContactEmail: text("primary_contact_email").notNull().default(""),
  legalForm: text("legal_form"),
  jurisdiction: text("jurisdiction").notNull().default(""),
  currentStep: text("current_step").notNull().default("profile"),
  data: jsonb("data").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
  lastSavedAt: timestamp("last_saved_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const stepperUploads = pgTable("stepper_uploads", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => stepperCases.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  byteSize: integer("byte_size").notNull().default(0),
  classifiedAs: text("classified_as").notNull().default("Pending"),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull(),
  storagePath: text("storage_path").notNull(),
  markdownPath: text("markdown_path"),
  status: text("status").notNull().default("uploading"),
  error: text("error"),
  extractedFields: jsonb("extracted_fields"),
  matchedRequirementKeys: text("matched_requirement_keys").array().notNull().default([]),
  classificationConfidence: text("classification_confidence"),
});

export const stepperAudit = pgTable("stepper_audit", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => stepperCases.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true, mode: "string" }).notNull(),
  actor: text("actor").notNull(),
  type: text("type").notNull(),
  detail: text("detail").notNull(),
});

export type StepperCaseRow = typeof stepperCases.$inferSelect;
export type StepperUploadRow = typeof stepperUploads.$inferSelect;
export type StepperAuditRow = typeof stepperAudit.$inferSelect;
