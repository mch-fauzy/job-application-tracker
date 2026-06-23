DROP INDEX "applications_active_updated_at_id_idx";--> statement-breakpoint
DROP INDEX "audit_entity_idx";--> statement-breakpoint
CREATE INDEX "applications_active_updated_at_id_idx" ON "applications" USING btree ("updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "applications"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);