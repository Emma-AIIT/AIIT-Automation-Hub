/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // GramJS (Telegram direct mode, src/lib/server/telegram.ts) uses Node built-ins
  // and dynamic requires that do not survive bundling; load it from node_modules.
  serverExternalPackages: ["telegram"],
};

export default config;
