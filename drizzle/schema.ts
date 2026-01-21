import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Image processing jobs table - stores each processing request
 */
export const imageJobs = mysqlTable("image_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  prompt: text("prompt"),
  aspectRatio: varchar("aspectRatio", { length: 16 }).default("auto"),
  resolution: mysqlEnum("resolution", ["1K", "2K", "4K"]).default("1K"),
  outputFormat: mysqlEnum("outputFormat", ["jpeg", "png", "webp"]).default("png"),
  imageCount: int("imageCount").default(1),
  notifyOnComplete: int("notifyOnComplete").default(0),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ImageJob = typeof imageJobs.$inferSelect;
export type InsertImageJob = typeof imageJobs.$inferInsert;

/**
 * Image files table - stores original and processed images
 */
export const imageFiles = mysqlTable("image_files", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  type: mysqlEnum("type", ["original", "processed"]).notNull(),
  url: text("url").notNull(),
  fileKey: varchar("fileKey", { length: 512 }),
  fileName: varchar("fileName", { length: 256 }),
  mimeType: varchar("mimeType", { length: 64 }),
  width: int("width"),
  height: int("height"),
  fileSize: int("fileSize"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImageFile = typeof imageFiles.$inferSelect;
export type InsertImageFile = typeof imageFiles.$inferInsert;