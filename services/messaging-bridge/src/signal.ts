import { BridgeError, type Group, type Platform, type SendInput } from "./platform";

export type SignalConfig = {
  number: string;
  apiUrl: string;
};

/** Subset of signal-cli-rest-api's GET /v1/groups/{number} entries that we use. */
type SignalGroup = {
  id?: string;
  name?: string;
  blocked?: boolean;
  /** False once the account has left or been removed. Older signal-cli-rest-api versions omit it. */
  member?: boolean;
};

const SEND_TIMEOUT_MS = 50_000;
const QUICK_TIMEOUT_MS = 5_000;

/**
 * Talks to bbernhard/signal-cli-rest-api over the internal Docker network.
 * The bridge is a linked secondary device of an existing Signal phone.
 */
export class SignalPlatform implements Platform {
  constructor(
    private readonly config: SignalConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(path: string): string {
    return `${this.config.apiUrl.replace(/\/+$/, "")}${path}`;
  }

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    try {
      return await this.fetchImpl(this.url(path), {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "not reachable";
      throw new BridgeError(502, `Signal: signal-api ${reason}`);
    }
  }

  async isReady(): Promise<boolean> {
    const res = await this.request("/v1/accounts", { method: "GET" }, QUICK_TIMEOUT_MS);
    if (!res.ok) return false;
    const accounts = (await res.json()) as unknown;
    return Array.isArray(accounts) && accounts.includes(this.config.number);
  }

  async syncGroups(): Promise<Group[]> {
    const res = await this.request(
      `/v1/groups/${encodeURIComponent(this.config.number)}`,
      { method: "GET" },
      SEND_TIMEOUT_MS,
    );
    if (!res.ok) throw await signalError(res);
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) throw new BridgeError(502, "Signal: unexpected groups response");

    return (body as SignalGroup[])
      .filter((g) => typeof g.id === "string" && g.id !== "")
      .filter((g) => !g.blocked && g.member !== false)
      .map((g) => ({ id: g.id!, name: g.name?.trim() || "(unnamed group)" }));
  }

  async send(input: SendInput): Promise<void> {
    const payload: Record<string, unknown> = {
      number: this.config.number,
      message: input.message,
      recipients: [input.chatId],
    };
    if (input.file) {
      // signal-cli-rest-api parses ";" and "," inside the data URI, so keep them out of the name.
      const filename = input.file.name.replace(/[;,]/g, "_");
      payload.base64_attachments = [
        `data:${input.file.type};filename=${filename};base64,${input.file.data.toString("base64")}`,
      ];
    }

    const res = await this.request(
      "/v2/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      SEND_TIMEOUT_MS,
    );
    if (!res.ok) throw await signalError(res);
  }
}

async function signalError(res: Response): Promise<BridgeError> {
  let detail = `HTTP ${res.status}`;
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error) detail = parsed.error;
    } catch {
      if (text.trim()) detail = text.trim();
    }
  } catch {
    // keep the status-only detail
  }
  return new BridgeError(502, `Signal: ${detail.slice(0, 300)}`);
}
