CREATE TABLE "stepper_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	"type" text NOT NULL,
	"detail" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stepper_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"investor_name" text DEFAULT '' NOT NULL,
	"primary_contact" text DEFAULT '' NOT NULL,
	"primary_contact_email" text DEFAULT '' NOT NULL,
	"legal_form" text,
	"jurisdiction" text DEFAULT '' NOT NULL,
	"current_step" text DEFAULT 'profile' NOT NULL,
	"data" jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"last_saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stepper_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"classified_as" text DEFAULT 'Pending' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"storage_path" text NOT NULL,
	"markdown_path" text,
	"status" text DEFAULT 'uploading' NOT NULL,
	"error" text,
	"extracted_fields" jsonb,
	"matched_requirement_keys" text[] DEFAULT '{}' NOT NULL,
	"classification_confidence" text
);
--> statement-breakpoint
ALTER TABLE "stepper_audit" ADD CONSTRAINT "stepper_audit_case_id_stepper_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."stepper_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stepper_uploads" ADD CONSTRAINT "stepper_uploads_case_id_stepper_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."stepper_cases"("id") ON DELETE cascade ON UPDATE no action;