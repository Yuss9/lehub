ALTER TABLE "document" ADD COLUMN "ocr_started_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "intervention" SET "task_title" = "maintenance"."title" FROM "maintenance" WHERE "intervention"."maintenance_id" = "maintenance"."id" AND "intervention"."task_title" = '';
