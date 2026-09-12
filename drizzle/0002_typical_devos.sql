CREATE TABLE `po_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`po_item_id` integer NOT NULL,
	`pr_id` integer,
	`pr_number` text,
	`pr_item_id` integer,
	`qty` real,
	FOREIGN KEY (`po_item_id`) REFERENCES `po_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `po_docs` (
	`id` integer PRIMARY KEY NOT NULL,
	`po_id` integer NOT NULL,
	`name` text,
	`status` text,
	`note` text,
	FOREIGN KEY (`po_id`) REFERENCES `pos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `po_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`po_id` integer NOT NULL,
	`original_id` integer,
	`code` text,
	`category` text,
	`name` text,
	`desc` text,
	`spec` text,
	`unit` text,
	`qty` real,
	`estimate` real,
	`price` real,
	`delivery_status` text,
	`delivered_qty` real,
	`delivery_date` text,
	FOREIGN KEY (`po_id`) REFERENCES `pos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `po_payments` (
	`id` integer PRIMARY KEY NOT NULL,
	`po_id` integer NOT NULL,
	`phase` text,
	`percent` real,
	`amount` real,
	`status` text,
	`date` text,
	FOREIGN KEY (`po_id`) REFERENCES `pos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pos` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`number` text NOT NULL,
	`pr_number` text,
	`supplier_id` integer,
	`created_date` text,
	`expected_date` text,
	`status` text,
	`note` text,
	`contract_note` text
);
--> statement-breakpoint
CREATE TABLE `pr_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pr_id` integer NOT NULL,
	`original_id` integer,
	`code` text,
	`category` text,
	`name` text,
	`desc` text,
	`spec` text,
	`unit` text,
	`qty` real,
	`estimate` real,
	FOREIGN KEY (`pr_id`) REFERENCES `prs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`code` text NOT NULL,
	`category` text,
	`name` text NOT NULL,
	`desc` text,
	`spec` text,
	`unit` text,
	`estimate` real
);
--> statement-breakpoint
CREATE TABLE `prs` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`number` text NOT NULL,
	`date` text,
	`department` text,
	`purpose` text,
	`status` text,
	`note` text
);
--> statement-breakpoint
CREATE TABLE `purchase_history` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`warehouse_code` text,
	`warehouse_name` text,
	`item_code` text,
	`item_name` text,
	`accounting_date` text,
	`document_date` text,
	`document_no` text,
	`invoice_date` text,
	`invoice_no` text,
	`description` text,
	`unit` text,
	`unit_price` real,
	`quantity` real,
	`value` real,
	`supplier_code` text,
	`supplier_name` text,
	`supplier_id` integer,
	`department` text
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`pr_id` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`price` text,
	`note` text,
	`price_mode` text,
	`vat_rate` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`bank_account` text,
	`bank` text,
	`address` text,
	`contact` text,
	`phone` text
);
--> statement-breakpoint
CREATE TABLE `trash_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`type` text,
	`label` text,
	`deleted_at` text,
	`expires_at` text,
	`data` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`must_change_password` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);