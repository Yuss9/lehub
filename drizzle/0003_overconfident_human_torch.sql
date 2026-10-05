CREATE TABLE "offline_mutation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"household_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "password_reset_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "reminder_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"due_on" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reminder_preference" (
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"lead_days" integer DEFAULT 7 NOT NULL,
	CONSTRAINT "reminder_preference_household_id_user_id_pk" PRIMARY KEY("household_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "tags" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "extracted_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "ocr_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "purchased_cents" integer;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "seller" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "tags" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "intervention" ADD COLUMN "outcome" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE "intervention" ADD COLUMN "cost_cents" integer;--> statement-breakpoint
ALTER TABLE "intervention" ADD COLUMN "task_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD COLUMN "category" text DEFAULT 'Autres' NOT NULL;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "offline_mutation" ADD CONSTRAINT "offline_mutation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_mutation" ADD CONSTRAINT "offline_mutation_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset" ADD CONSTRAINT "password_reset_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_delivery" ADD CONSTRAINT "reminder_delivery_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_delivery" ADD CONSTRAINT "reminder_delivery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_preference" ADD CONSTRAINT "reminder_preference_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_preference" ADD CONSTRAINT "reminder_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_dedupe_idx" ON "reminder_delivery" USING btree ("household_id","user_id","kind","target_id","due_on");