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
    // Shared secret echoed back by VAPI on the per-call server override, so the
    // outcome webhook can reject anything that did not come from our own calls.
    VAPI_WEBHOOK_SECRET: z.string().min(1).optional(),
    // Absolute origin VAPI should post end-of-call reports to. Falls back to the
    // Vercel production URL, which is what production actually runs on.
    APP_PUBLIC_URL: z.string().url().optional(),
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_FROM_NUMBER: z.string().min(1).optional(),
    // Where the internal copy of every call-outcome SMS goes.
    OPS_SMS_NUMBER: z.string().min(1).optional(),
    // Who receives the post-call lead summary email.
    LEAD_SUMMARY_EMAIL: z.string().email().optional(),
    MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL: z.string().url().optional(),
    // Susu Closets
    MAKE_WHATSAPP_SUSU_PULL_GROUPS_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_SUSU_SEND_MESSAGE_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_SUSU_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_SUSU_PULL_PARTICIPANTS_WEBHOOK_URL: z.string().url().optional(),
    // GIM Foundation
    MAKE_WHATSAPP_GIM_PULL_GROUPS_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_GIM_SEND_MESSAGE_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_GIM_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_GIM_PULL_PARTICIPANTS_WEBHOOK_URL: z.string().url().optional(),
    // AIIT Business Account
    MAKE_WHATSAPP_BUSINESS_PULL_GROUPS_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_BUSINESS_SEND_MESSAGE_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_BUSINESS_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL: z.string().url().optional(),
    MAKE_WHATSAPP_BUSINESS_PULL_PARTICIPANTS_WEBHOOK_URL: z.string().url().optional(),
    WHATSAPP_IMPORT_SECRET: z.string().min(1).optional(),
    WHATSAPP_ALERT_EMAIL: z.string().email().optional(),
    CRON_SECRET: z.string().min(1).optional(),
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
    VAPI_WEBHOOK_SECRET: process.env.VAPI_WEBHOOK_SECRET,
    APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
    OPS_SMS_NUMBER: process.env.OPS_SMS_NUMBER,
    LEAD_SUMMARY_EMAIL: process.env.LEAD_SUMMARY_EMAIL,
    MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL: process.env.MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL,
    MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL: process.env.MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL,
    MAKE_WHATSAPP_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL: process.env.MAKE_WHATSAPP_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL,
    MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL: process.env.MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL,
    MAKE_WHATSAPP_SUSU_PULL_GROUPS_WEBHOOK_URL: process.env.MAKE_WHATSAPP_SUSU_PULL_GROUPS_WEBHOOK_URL,
    MAKE_WHATSAPP_SUSU_SEND_MESSAGE_WEBHOOK_URL: process.env.MAKE_WHATSAPP_SUSU_SEND_MESSAGE_WEBHOOK_URL,
    MAKE_WHATSAPP_SUSU_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL: process.env.MAKE_WHATSAPP_SUSU_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL,
    MAKE_WHATSAPP_SUSU_PULL_PARTICIPANTS_WEBHOOK_URL: process.env.MAKE_WHATSAPP_SUSU_PULL_PARTICIPANTS_WEBHOOK_URL,
    MAKE_WHATSAPP_GIM_PULL_GROUPS_WEBHOOK_URL: process.env.MAKE_WHATSAPP_GIM_PULL_GROUPS_WEBHOOK_URL,
    MAKE_WHATSAPP_GIM_SEND_MESSAGE_WEBHOOK_URL: process.env.MAKE_WHATSAPP_GIM_SEND_MESSAGE_WEBHOOK_URL,
    MAKE_WHATSAPP_GIM_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL: process.env.MAKE_WHATSAPP_GIM_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL,
    MAKE_WHATSAPP_GIM_PULL_PARTICIPANTS_WEBHOOK_URL: process.env.MAKE_WHATSAPP_GIM_PULL_PARTICIPANTS_WEBHOOK_URL,
    MAKE_WHATSAPP_BUSINESS_PULL_GROUPS_WEBHOOK_URL: process.env.MAKE_WHATSAPP_BUSINESS_PULL_GROUPS_WEBHOOK_URL,
    MAKE_WHATSAPP_BUSINESS_SEND_MESSAGE_WEBHOOK_URL: process.env.MAKE_WHATSAPP_BUSINESS_SEND_MESSAGE_WEBHOOK_URL,
    MAKE_WHATSAPP_BUSINESS_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL: process.env.MAKE_WHATSAPP_BUSINESS_SEND_PARTICIPANT_MESSAGE_WEBHOOK_URL,
    MAKE_WHATSAPP_BUSINESS_PULL_PARTICIPANTS_WEBHOOK_URL: process.env.MAKE_WHATSAPP_BUSINESS_PULL_PARTICIPANTS_WEBHOOK_URL,
    WHATSAPP_IMPORT_SECRET: process.env.WHATSAPP_IMPORT_SECRET,
    WHATSAPP_ALERT_EMAIL: process.env.WHATSAPP_ALERT_EMAIL,
    CRON_SECRET: process.env.CRON_SECRET,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
