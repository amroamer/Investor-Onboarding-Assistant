CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	"type" text NOT NULL,
	"detail" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"investor_name" text NOT NULL,
	"primary_contact" text NOT NULL,
	"current_stage" text NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"compliance_only" jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"last_saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "uploaded_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"file_name" text NOT NULL,
	"classified_as" text NOT NULL,
	"party" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"storage_path" text NOT NULL,
	"mapped_checklist_ids" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;