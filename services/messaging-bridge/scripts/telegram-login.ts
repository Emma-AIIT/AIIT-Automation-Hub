/**
 * One-off interactive login for the Telegram user account the bridge sends as.
 * Asks for phone number, login code and 2FA password, then prints the session
 * string to paste into TELEGRAM_SESSION in .env. Nothing is written to disk.
 *
 *   npm run telegram-login                                   (laptop, needs Node 20+)
 *   docker compose run --rm -it bridge node dist/scripts/telegram-login.js   (on the VM)
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { TelegramClient } from "telegram";
import { LogLevel } from "telegram/extensions/Logger";
import { StringSession } from "telegram/sessions";

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (question: string) => (await rl.question(question)).trim();

  const apiId = process.env.TELEGRAM_API_ID?.trim() || (await ask("api_id (from my.telegram.org): "));
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() || (await ask("api_hash (from my.telegram.org): "));
  if (!/^\d+$/.test(apiId) || !apiHash) throw new Error("api_id must be a number and api_hash must be set");

  const client = new TelegramClient(new StringSession(""), Number(apiId), apiHash, { connectionRetries: 5 });
  client.setLogLevel(LogLevel.ERROR);

  await client.start({
    phoneNumber: () => ask("Phone number in international format (e.g. +61412345678): "),
    phoneCode: () => ask("Login code Telegram just sent you: "),
    password: (hint) => ask(`Two-step verification password${hint ? ` (hint: ${hint})` : ""}: `),
    onError: (err) => {
      console.error(`Login error: ${err.message}`);
    },
  });

  const me = await client.getMe();
  const session = client.session.save() as unknown as string;
  console.log(`\nSigned in as ${me.firstName ?? ""} ${me.lastName ?? ""}`.trimEnd() + ".");
  console.log("\nPaste this line into .env (keep it secret, it is a full login to the account):\n");
  console.log(`TELEGRAM_SESSION=${session}\n`);

  rl.close();
  await client.disconnect();
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
