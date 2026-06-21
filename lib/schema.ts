import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

// A broadcaster account. Credentials auth (email + scrypt-hashed password);
// sessions are JWT, so no Auth.js adapter tables are needed.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One stream per broadcaster (Phase 2). broadcast_name is the globally-unique
// MoQ path viewers watch and the broadcaster publishes to.
export const streams = pgTable("streams", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  broadcastName: text("broadcast_name").notNull().unique(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Stream = typeof streams.$inferSelect;
