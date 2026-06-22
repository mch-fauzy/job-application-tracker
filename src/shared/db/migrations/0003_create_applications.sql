CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'saved' NOT NULL,
	"job_url" text,
	"notes" text
);
--> statement-breakpoint
CREATE INDEX "applications_status_updated_at_idx" ON "applications" USING btree ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_active_updated_at_id_idx" ON "applications" USING btree ("updated_at" DESC NULLS LAST,"id") WHERE "applications"."deleted_at" IS NULL;