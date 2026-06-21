import { pgTable, uuid, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  liveStartedAt: timestamp("live_started_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    streamId: uuid("stream_id").notNull().references(() => streams.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    recordingUrl: text("recording_url"),
    recordingDurationMs: integer("recording_duration_ms"),
    recordingOffsetMs: integer("recording_offset_ms").notNull().default(0),
  },
  (t) => ({
    oneOpenPerStream: uniqueIndex("sessions_one_open_per_stream")
      .on(t.streamId)
      .where(sql`${t.endedAt} is null`),
  }),
);

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  displayName: text("display_name").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  offsetMs: integer("offset_ms").notNull(),
});

export type User = typeof users.$inferSelect;
export type Stream = typeof streams.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
