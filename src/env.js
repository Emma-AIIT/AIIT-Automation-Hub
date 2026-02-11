import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    MAKE_SYNC_WEBHOOK_URL: z.string().url().optional(),
    MAKE_QUOTE_PIPELINE_GET_WEBHOOK_URL: z.string().url().optional(),
    MAKE_QUOTE_PIPELINE_UPDATE_WEBHOOK_URL: z.string().url().optional(),
    MAKE_PULL_TICKETS_WEBHOOK_URL: z.string().url().optional(),
    MAKE_STALE_TICKET_WEBHOOK_URL: z.string().url().optional(),
    MAKE_SEND_EMAIL_WEBHOOK_URL: z.string().url().optional(),
    VAPI_API_KEY: z.string().min(1).optional(),
  },

  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  },

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    MAKE_SYNC_WEBHOOK_URL: process.env.MAKE_SYNC_WEBHOOK_URL,
    MAKE_QUOTE_PIPELINE_GET_WEBHOOK_URL:
      process.env.MAKE_QUOTE_PIPELINE_GET_WEBHOOK_URL,
    MAKE_QUOTE_PIPELINE_UPDATE_WEBHOOK_URL:
      process.env.MAKE_QUOTE_PIPELINE_UPDATE_WEBHOOK_URL,
    MAKE_PULL_TICKETS_WEBHOOK_URL:
      process.env.MAKE_PULL_TICKETS_WEBHOOK_URL,
    MAKE_STALE_TICKET_WEBHOOK_URL:
      process.env.MAKE_STALE_TICKET_WEBHOOK_URL,
    MAKE_SEND_EMAIL_WEBHOOK_URL:
      process.env.MAKE_SEND_EMAIL_WEBHOOK_URL,
    VAPI_API_KEY: process.env.VAPI_API_KEY,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
