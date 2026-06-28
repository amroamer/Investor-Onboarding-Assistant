ALTER TABLE "uploaded_documents" ADD COLUMN "match_outcome" text DEFAULT 'matched' NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "match_reason" text;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "suggested_legal_form" text;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "classification_confidence" text;