CREATE TABLE "workspace_preferences" (
	"owner_user_id" uuid PRIMARY KEY NOT NULL,
	"default_league_id" uuid,
	"default_scoring_format" text DEFAULT 'ppr' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"compact_rankings" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_preferences" ADD CONSTRAINT "workspace_preferences_owner_user_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_preferences" ADD CONSTRAINT "workspace_preferences_default_league_id_league_configurations_id_fk" FOREIGN KEY ("default_league_id") REFERENCES "public"."league_configurations"("id") ON DELETE set null ON UPDATE no action;