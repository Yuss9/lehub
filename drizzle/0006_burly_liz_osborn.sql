CREATE TABLE "intervention_correction" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"intervention_id" text NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_alert" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_receipt" (
	"delivery_id" text NOT NULL,
	"device_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_receipt_delivery_id_device_key_pk" PRIMARY KEY("delivery_id","device_key")
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "label" text DEFAULT 'Navigateur' NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_state" ADD COLUMN "interval_seconds" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "intervention_correction" ADD CONSTRAINT "intervention_correction_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_correction" ADD CONSTRAINT "intervention_correction_intervention_id_intervention_id_fk" FOREIGN KEY ("intervention_id") REFERENCES "public"."intervention"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_correction" ADD CONSTRAINT "intervention_correction_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_receipt" ADD CONSTRAINT "push_receipt_delivery_id_reminder_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."reminder_delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correction_household_intervention_idx" ON "intervention_correction" USING btree ("household_id","intervention_id");--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Older endpoints have no reliable session owner. Re-enable notifications on
-- each browser after upgrading; never retain an unowned shared-device endpoint.
DELETE FROM "push_subscription" WHERE "session_id" IS NULL;
--> statement-breakpoint
UPDATE "reminder_preference" SET "push_enabled" = false WHERE "push_enabled" AND NOT EXISTS (
  SELECT 1 FROM "push_subscription" WHERE "push_subscription"."user_id" = "reminder_preference"."user_id" AND "push_subscription"."household_id" = "reminder_preference"."household_id"
);
