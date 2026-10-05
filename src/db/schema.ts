import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text(),
    password: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("account_provider_idx").on(t.providerId, t.accountId),
    index("account_user_idx").on(t.userId),
  ],
);
export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
export const rateLimit = pgTable("rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const household = pgTable("household", {
  id: text().primaryKey(),
  name: text().notNull(),
  currency: text().notNull().default("EUR"),
  timezone: text().notNull().default("Europe/Paris"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const membership = pgTable(
  "membership",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text({ enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.userId] }),
    check("membership_role_check", sql`${t.role} in ('admin', 'member')`),
  ],
);
export const installation = pgTable(
  "installation",
  {
    id: integer().primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id),
  },
  (t) => [check("installation_singleton", sql`${t.id} = 1`)],
);
export const invitation = pgTable(
  "invitation",
  {
    id: text().primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    email: text().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("invitation_household_idx").on(t.householdId)],
);

export const room = pgTable(
  "room",
  {
    id: text().primaryKey(),
    revision: integer().notNull().default(0),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text().notNull().default(""),
    position: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
  },
  (t) => [index("room_household_idx").on(t.householdId)],
);
export const equipment = pgTable(
  "equipment",
  {
    id: text().primaryKey(),
    revision: integer().notNull().default(0),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    roomId: text("room_id").references(() => room.id, { onDelete: "set null" }),
    name: text().notNull(),
    brand: text().notNull().default(""),
    model: text().notNull().default(""),
    serial: text().notNull().default(""),
    purchasedCents: integer("purchased_cents"),
    seller: text().notNull().default(""),
    tags: text().notNull().default(""),
    notes: text().notNull().default(""),
    purchasedOn: text("purchased_on"),
    warrantyUntil: text("warranty_until"),
    archived: boolean().notNull().default(false),
  },
  (t) => [index("equipment_household_idx").on(t.householdId)],
);
export const maintenance = pgTable(
  "maintenance",
  {
    id: text().primaryKey(),
    revision: integer().notNull().default(0),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    equipmentId: text("equipment_id").references(() => equipment.id, {
      onDelete: "set null",
    }),
    title: text().notNull(),
    notes: text().notNull().default(""),
    dueOn: text("due_on").notNull(),
    frequency: text().notNull().default("once"),
    interval: integer().notNull().default(1),
    recurrenceMode: text("recurrence_mode").notNull().default("fixed"),
    anchorDay: integer("anchor_day").notNull(),
    archived: boolean().notNull().default(false),
  },
  (t) => [index("maintenance_household_idx").on(t.householdId)],
);
export const intervention = pgTable(
  "intervention",
  {
    id: text().primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    maintenanceId: text("maintenance_id")
      .notNull()
      .references(() => maintenance.id, { onDelete: "cascade" }),
    completedOn: text("completed_on").notNull(),
    scheduledOn: text("scheduled_on").notNull(),
    outcome: text().notNull().default("completed"),
    costCents: integer("cost_cents"),
    taskTitle: text("task_title").notNull().default(""),
    notes: text().notNull().default(""),
    completedBy: text("completed_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("intervention_household_idx").on(t.householdId)],
);
export const shoppingList = pgTable(
  "shopping_list",
  {
    id: text().primaryKey(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    revision: integer().notNull().default(0),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text().notNull(),
  },
  (t) => [index("shoppingList_household_idx").on(t.householdId)],
);
export const shoppingItem = pgTable(
  "shopping_item",
  {
    id: text().primaryKey(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    revision: integer().notNull().default(0),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    listId: text("list_id")
      .notNull()
      .references(() => shoppingList.id, { onDelete: "cascade" }),
    name: text().notNull(),
    category: text().notNull().default("Autres"),
    quantity: text().notNull().default("1"),
    checked: boolean().notNull().default(false),
    equipmentId: text("equipment_id").references(() => equipment.id, {
      onDelete: "set null",
    }),
    maintenanceId: text("maintenance_id").references(() => maintenance.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("shoppingItem_household_idx").on(t.householdId)],
);
export const document = pgTable(
  "document",
  {
    id: text().primaryKey(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    revision: integer().notNull().default(0),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    equipmentId: text("equipment_id").references(() => equipment.id, {
      onDelete: "set null",
    }),
    tags: text().notNull().default(""),
    extractedText: text("extracted_text").notNull().default(""),
    ocrStartedAt: timestamp("ocr_started_at", { withTimezone: true }),
    ocrStatus: text("ocr_status").notNull().default("pending"),
    title: text().notNull(),
    category: text().notNull(),
    originalName: text("original_name").notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    storageKey: text("storage_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("document_household_idx").on(t.householdId)],
);

export const passwordReset = pgTable("password_reset", {
  id: text().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const reminderPreference = pgTable(
  "reminder_preference",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").notNull().default(false),
    leadDays: integer("lead_days").notNull().default(7),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);
export const reminderDelivery = pgTable(
  "reminder_delivery",
  {
    id: text().primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    targetId: text("target_id").notNull(),
    dueOn: text("due_on").notNull(),
    status: text().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("reminder_dedupe_idx").on(
      t.householdId,
      t.userId,
      t.kind,
      t.targetId,
      t.dueOn,
    ),
  ],
);
export const offlineMutation = pgTable("offline_mutation", {
  id: text().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  householdId: text("household_id")
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
