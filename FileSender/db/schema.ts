import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const transfers = sqliteTable("transfers", {
  id: text("id").primaryKey(),
  codeHash: text("code_hash").notNull(),
  downloadToken: text("download_token").notNull(),
  uploadToken: text("upload_token").notNull(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (t) => [uniqueIndex("idx_transfers_code_hash").on(t.codeHash), uniqueIndex("idx_transfers_download_token").on(t.downloadToken), uniqueIndex("idx_transfers_upload_token").on(t.uploadToken), index("idx_transfers_expires_at").on(t.expiresAt)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
}, (t) => [index("idx_rate_limits_expires_at").on(t.expiresAt)]);
