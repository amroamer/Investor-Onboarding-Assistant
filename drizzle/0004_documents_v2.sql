ALTER TABLE "stepper_cases" ADD COLUMN "resume_token" text;--> statement-breakpoint
ALTER TABLE "stepper_uploads" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "stepper_uploads" ADD COLUMN "processing_phase" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "stepper_uploads" ADD COLUMN "thumbnail_excerpt" text;--> statement-breakpoint
ALTER TABLE "stepper_cases" ADD CONSTRAINT "stepper_cases_resume_token_unique" UNIQUE("resume_token");