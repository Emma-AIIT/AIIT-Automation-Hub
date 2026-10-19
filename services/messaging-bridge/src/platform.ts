/**
 * Shared shapes for the two messaging platforms the bridge speaks to.
 * The HTTP layer (app.ts) only talks to this interface, so tests can swap in mocks.
 */

export type Group = { id: string; name: string };

export type OutgoingFile = {
  name: string;
  type: string;
  data: Buffer;
};

export type SendInput = {
  chatId: string;
  message: string;
  file?: OutgoingFile;
};

export interface Platform {
  /** True when the platform is connected (Telegram) or the device is linked (Signal). */
  isReady(): Promise<boolean>;
  syncGroups(): Promise<Group[]>;
  /** Resolves once the platform has accepted the message; throws BridgeError otherwise. */
  send(input: SendInput): Promise<void>;
}

/** An error whose message is safe and readable enough to show in the Hub UI. */
export class BridgeError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 413 | 429 | 502 | 503 | 504,
    message: string,
  ) {
    super(message);
    this.name = "BridgeError";
  }
}
