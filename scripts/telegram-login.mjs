/**
 * One-off interactive login for Telegram direct mode (src/lib/server/telegram.ts).
 * Asks for api_id, api_hash, phone number, login code and 2FA password, then
 * prints the session string for TELEGRAM_SESSION. Nothing is written to disk.
 *
 *   npm run telegram-login        (works in PowerShell; needs Node 20+)
 *
 * Get api_id / api_hash first at https://my.telegram.org > API development tools,
 * signed in with Ali's number. See HANDOVER.md "Telegram (direct)".
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { TelegramClient, sessions } from "telegram";

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (question) => (await rl.question(question)).trim();

  const apiId = process.env.TELEGRAM_API_ID?.trim() || (await ask("api_id (from my.telegram.org): "));
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() || (await ask("api_hash (from my.telegram.org): "));
  if (!/^\d+$/.test(apiId) || !apiHash) throw new Error("api_id must be a number and api_hash must be set");

  const client = new TelegramClient(new sessions.StringSession(""), Number(apiId), apiHash, {
    connectionRetries: 5,
  });
  client.setLogLevel("error");

  await client.start({
    phoneNumber: () => ask("Phone number in international format (e.g. +61412345678): "),
    phoneCode: () => ask("Login code Telegram just sent you (in the Telegram app): "),
    password: (hint) => ask(`Two-step verification password${hint ? ` (hint: ${hint})` : ""}: `),
    onError: (err) => {
      console.error(`Login error: ${err.message}`);
    },
  });

  const me = await client.getMe();
  const session = client.session.save();
  console.log(`\nSigned in as ${[me.firstName, me.lastName].filter(Boolean).join(" ")}.`);
  console.log("\nThis is TELEGRAM_SESSION. Keep it secret: it is a full login to the account.\n");
  console.log(session);
  console.log("\nAdd it to Vercel with:  vercel env add TELEGRAM_SESSION production --sensitive\n");

  rl.close();
  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
