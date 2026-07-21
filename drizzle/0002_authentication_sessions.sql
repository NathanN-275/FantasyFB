CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "authorized_user_identities" ADD COLUMN "access_token" text;--> statement-breakpoint
ALTER TABLE "authorized_user_identities" ADD COLUMN "refresh_token" text;--> statement-breakpoint
ALTER TABLE "authorized_user_identities" ADD COLUMN "id_token" text;--> statement-breakpoint
ALTER TABLE "authorized_user_identities" ADD COLUMN "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "authorized_user_identities" ADD COLUMN "refresh_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "authorized_user_identities" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "authorized_user_identities" ADD COLUMN "password" text;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_accounts" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_user_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_index" ON "auth_sessions" USING btree ("user_id");