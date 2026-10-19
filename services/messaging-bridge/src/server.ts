import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { SignalPlatform } from "./signal";
import { TelegramPlatform } from "./telegram";

const config = loadConfig(process.env);

const telegram = config.telegram ? new TelegramPlatform(config.telegram) : undefined;
const signal = config.signal ? new SignalPlatform(config.signal) : undefined;
telegram?.start();

const app = createApp({
  secret: config.secret,
  telegram,
  signal,
  log: (line) => console.log(`${new Date().toISOString()} ${line}`),
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `messaging bridge listening on :${info.port} (telegram ${telegram ? "on" : "off"}, signal ${signal ? "on" : "off"})`,
  );
});

async function shutdown(): Promise<void> {
  server.close();
  await telegram?.stop();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
