ALTER TABLE "uploaded_documents" ADD COLUMN "mime_type" text DEFAULT 'application/octet-stream' NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "byte_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "markdown_path" text;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "extraction_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "extraction_error" text;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "extracted_fields" jsonb;