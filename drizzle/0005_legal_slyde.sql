CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_state" (
	"id" text PRIMARY KEY NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
DROP INDEX "reminder_dedupe_idx";--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "ocr_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "ocr_error" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "household" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "intervention" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_delivery" ADD COLUMN "channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_delivery" ADD COLUMN "last_error" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_delivery" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_preference" ADD COLUMN "push_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_owner_endpoint_idx" ON "push_subscription" USING btree ("household_id","user_id","endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_dedupe_idx" ON "reminder_delivery" USING btree ("household_id","user_id","kind","target_id","due_on","channel");