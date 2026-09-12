import { integer, sqliteTable, text, real } from "drizzle-orm/sqlite-core";

// --- System Tables ---

export const appState = sqliteTable("app_state", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const shareLinks = sqliteTable("share_links", {
  token: text("token").primaryKey(),
  label: text("label").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  lastViewedAt: text("last_viewed_at"),
  viewCount: integer("view_count").notNull().default(0),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  role: text("role").notNull(),
  active: integer("active").notNull().default(1),
  mustChangePassword: integer("must_change_password").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});


// --- Business Tables ---

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  bankAccount: text("bank_account"),
  bank: text("bank"),
  address: text("address"),
  contact: text("contact"),
  phone: text("phone"),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  code: text("code").notNull(),
  category: text("category"),
  name: text("name").notNull(),
  desc: text("desc"),
  spec: text("spec"),
  unit: text("unit"),
  estimate: real("estimate"),
});

export const prs = sqliteTable("prs", {
  id: integer("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  number: text("number").notNull(),
  date: text("date"),
  department: text("department"),
  purpose: text("purpose"),
  status: text("status"),
  note: text("note"),
});

export const prItems = sqliteTable("pr_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  prId: integer("pr_id").notNull().references(() => prs.id, { onDelete: "cascade" }),
  originalId: integer("original_id"), // original item id
  code: text("code"),
  category: text("category"),
  name: text("name"),
  desc: text("desc"),
  spec: text("spec"),
  unit: text("unit"),
  qty: real("qty"),
  estimate: real("estimate"),
});

export const pos = sqliteTable("pos", {
  id: integer("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  number: text("number").notNull(),
  prNumber: text("pr_number"),
  supplierId: integer("supplier_id"),
  createdDate: text("created_date"),
  expectedDate: text("expected_date"),
  status: text("status"),
  note: text("note"),
  contractNote: text("contract_note"),
});

export const poItems = sqliteTable("po_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poId: integer("po_id").notNull().references(() => pos.id, { onDelete: "cascade" }),
  originalId: integer("original_id"),
  code: text("code"),
  category: text("category"),
  name: text("name"),
  desc: text("desc"),
  spec: text("spec"),
  unit: text("unit"),
  qty: real("qty"),
  estimate: real("estimate"),
  price: real("price"),
  deliveryStatus: text("delivery_status"),
  deliveredQty: real("delivered_qty"),
  deliveryDate: text("delivery_date"),
});

export const poAllocations = sqliteTable("po_allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poItemId: integer("po_item_id").notNull().references(() => poItems.id, { onDelete: "cascade" }),
  prId: integer("pr_id"),
  prNumber: text("pr_number"),
  prItemId: integer("pr_item_id"),
  qty: real("qty"),
});

export const quotes = sqliteTable("quotes", {
  prId: integer("pr_id").notNull(),
  supplierId: integer("supplier_id").notNull(),
  price: text("price"),
  note: text("note"),
  priceMode: text("price_mode"),
  vatRate: text("vat_rate"),
});

export const purchaseHistory = sqliteTable("purchase_history", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  warehouseCode: text("warehouse_code"),
  warehouseName: text("warehouse_name"),
  itemCode: text("item_code"),
  itemName: text("item_name"),
  accountingDate: text("accounting_date"),
  documentDate: text("document_date"),
  documentNo: text("document_no"),
  invoiceDate: text("invoice_date"),
  invoiceNo: text("invoice_no"),
  description: text("description"),
  unit: text("unit"),
  unitPrice: real("unit_price"),
  quantity: real("quantity"),
  value: real("value"),
  supplierCode: text("supplier_code"),
  supplierName: text("supplier_name"),
  supplierId: integer("supplier_id"),
  department: text("department"),
});

export const poDocs = sqliteTable("po_docs", {
  id: integer("id").primaryKey(),
  poId: integer("po_id").notNull().references(() => pos.id, { onDelete: "cascade" }),
  name: text("name"),
  status: text("status"),
  note: text("note"),
});

export const poPayments = sqliteTable("po_payments", {
  id: integer("id").primaryKey(),
  poId: integer("po_id").notNull().references(() => pos.id, { onDelete: "cascade" }),
  phase: text("phase"),
  percent: real("percent"),
  amount: real("amount"),
  status: text("status"),
  date: text("date"),
});

export const trashItems = sqliteTable("trash_items", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  type: text("type"),
  label: text("label"),
  deletedAt: text("deleted_at"),
  expiresAt: text("expires_at"),
  data: text("data"), // JSON
});
