CREATE TABLE "stepper_compliance_state" (
	"case_id" text PRIMARY KEY NOT NULL,
	"suggested_outcome" text DEFAULT 'PENDING' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_band" text DEFAULT 'Low' NOT NULL,
	"red_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"names_to_screen" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"further_info_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasoning" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stepper_compliance_state" ADD CONSTRAINT "stepper_compliance_state_case_id_stepper_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."stepper_cases"("id") ON DELETE cascade ON UPDATE no action;
