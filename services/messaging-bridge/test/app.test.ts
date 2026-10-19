import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp, keyMatches, MAX_FILE_BYTES } from "../src/app";
import { BridgeError, type Group, type Platform, type SendInput } from "../src/platform";

const SECRET = "test-secret-0123456789abcdef";

class MockPlatform implements Platform {
  sent: SendInput[] = [];
  ready = true;
  failWith?: Error;
  groups: Group[] = [{ id: "-1001234567890", name: "Clients" }];

  async isReady() {
    return this.ready;
  }
  async syncGroups() {
    if (this.failWith) throw this.failWith;
    return this.groups;
  }
  async send(input: SendInput) {
    if (this.failWith) throw this.failWith;
    this.sent.push(input);
  }
}

function setup(platforms: { telegram?: Platform; signal?: Platform } = {}) {
  const lines: string[] = [];
  const app = createApp({ secret: SECRET, ...platforms, log: (l) => lines.push(l) });
  return { app, lines };
}

function json(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

describe("auth", () => {
  it("compares keys", () => {
    assert.equal(keyMatches(SECRET, SECRET), true);
    assert.equal(keyMatches("wrong", SECRET), false);
    assert.equal(keyMatches(undefined, SECRET), false);
    assert.equal(keyMatches("", SECRET), false);
  });

  it("rejects a missing key with 401", async () => {
    const { app } = setup({ telegram: new MockPlatform() });
    const res = await app.request("/telegram/send", json({ chatId: "1", message: "hi" }));
    assert.equal(res.status, 401);
  });

  it("rejects a wrong key with 401 even when the platform is not configured", async () => {
    const { app } = setup();
    const res = await app.request("/signal/sync-groups?key=nope", json({ trigger: "pull_groups" }));
    assert.equal(res.status, 401);
  });
});

describe("unconfigured platforms", () => {
  it("returns 503 with a readable message", async () => {
    const { app } = setup({ telegram: new MockPlatform() });
    const res = await app.request(`/signal/send?key=${SECRET}`, json({ chatId: "group.abc", message: "hi" }));
    assert.equal(res.status, 503);
    assert.equal(await res.text(), "Signal is not configured");

    const { app: empty } = setup();
    const tg = await empty.request(`/telegram/sync-groups?key=${SECRET}`, json({ trigger: "pull_groups" }));
    assert.equal(tg.status, 503);
    assert.equal(await tg.text(), "Telegram is not configured");
  });
});

describe("sync-groups", () => {
  it("returns the groups and their count", async () => {
    const signal = new MockPlatform();
    signal.groups = [
      { id: "group.a", name: "A" },
      { id: "group.b", name: "B" },
    ];
    const { app, lines } = setup({ signal });
    const res = await app.request(`/signal/sync-groups?key=${SECRET}`, json({ trigger: "pull_groups" }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { synced: 2, groups: signal.groups });
    assert.match(lines[0]!, /signal sync-groups ok count=2/);
  });

  it("ignores a missing or odd body", async () => {
    const { app } = setup({ telegram: new MockPlatform() });
    const res = await app.request(`/telegram/sync-groups?key=${SECRET}`, { method: "POST" });
    assert.equal(res.status, 200);
  });

  it("passes platform errors through as plain text", async () => {
    const telegram = new MockPlatform();
    telegram.failWith = new BridgeError(429, "Telegram: rate limited, try again in 120s");
    const { app } = setup({ telegram });
    const res = await app.request(`/telegram/sync-groups?key=${SECRET}`, json({}));
    assert.equal(res.status, 429);
    assert.equal(await res.text(), "Telegram: rate limited, try again in 120s");
  });
});

describe("send", () => {
  it("accepts JSON text messages", async () => {
    const telegram = new MockPlatform();
    const { app, lines } = setup({ telegram });
    const res = await app.request(`/telegram/send?key=${SECRET}`, json({ chatId: "-100123", message: "Hello" }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(telegram.sent, [{ chatId: "-100123", message: "Hello" }]);
    // The log names the chat but never the message body.
    assert.match(lines[0]!, /telegram send chat=-100123 file=no ok/);
    assert.doesNotMatch(lines[0]!, /Hello/);
  });

  it("accepts multipart with a file and caption", async () => {
    const signal = new MockPlatform();
    const { app } = setup({ signal });
    const form = new FormData();
    form.set("chatId", "group.xyz");
    form.set("message", "Invoice attached");
    form.set("file", new File([Buffer.from("%PDF-1.4")], "invoice.pdf", { type: "application/pdf" }));
    const res = await app.request(`/signal/send?key=${SECRET}`, { method: "POST", body: form });
    assert.equal(res.status, 200);
    const sent = signal.sent[0]!;
    assert.equal(sent.chatId, "group.xyz");
    assert.equal(sent.message, "Invoice attached");
    assert.equal(sent.file?.name, "invoice.pdf");
    assert.equal(sent.file?.type, "application/pdf");
    assert.equal(sent.file?.data.toString(), "%PDF-1.4");
  });

  it("accepts multipart with a file and an empty message", async () => {
    const telegram = new MockPlatform();
    const { app } = setup({ telegram });
    const form = new FormData();
    form.set("chatId", "-100123");
    form.set("message", "");
    form.set("file", new File([Buffer.from([1, 2, 3])], "photo.jpg", { type: "image/jpeg" }));
    const res = await app.request(`/telegram/send?key=${SECRET}`, { method: "POST", body: form });
    assert.equal(res.status, 200);
    assert.equal(telegram.sent[0]?.message, "");
    assert.equal(telegram.sent[0]?.file?.data.length, 3);
  });

  it("rejects a missing chatId with 400", async () => {
    const telegram = new MockPlatform();
    const { app } = setup({ telegram });
    const res = await app.request(`/telegram/send?key=${SECRET}`, json({ message: "hi" }));
    assert.equal(res.status, 400);
    assert.equal(await res.text(), "Telegram: chatId is required");

    const form = new FormData();
    form.set("message", "hi");
    const multipart = await app.request(`/telegram/send?key=${SECRET}`, { method: "POST", body: form });
    assert.equal(multipart.status, 400);
    assert.equal(telegram.sent.length, 0);
  });

  it("rejects an empty text-only message with 400", async () => {
    const { app } = setup({ signal: new MockPlatform() });
    const res = await app.request(`/signal/send?key=${SECRET}`, json({ chatId: "group.a", message: "  " }));
    assert.equal(res.status, 400);
  });

  it("rejects a body that is not JSON with 400", async () => {
    const { app } = setup({ signal: new MockPlatform() });
    const res = await app.request(`/signal/send?key=${SECRET}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "chatId=1",
    });
    assert.equal(res.status, 400);
  });

  it("rejects files over 10 MB with 413", async () => {
    const telegram = new MockPlatform();
    const { app } = setup({ telegram });
    const form = new FormData();
    form.set("chatId", "-100123");
    form.set("message", "");
    form.set("file", new File([new Uint8Array(MAX_FILE_BYTES + 1)], "big.bin"));
    const res = await app.request(`/telegram/send?key=${SECRET}`, { method: "POST", body: form });
    assert.equal(res.status, 413);
    assert.equal(telegram.sent.length, 0);
  });

  it("returns the platform error text when sending fails", async () => {
    const telegram = new MockPlatform();
    telegram.failWith = new BridgeError(502, "Telegram: CHAT_WRITE_FORBIDDEN");
    const { app, lines } = setup({ telegram });
    const res = await app.request(`/telegram/send?key=${SECRET}`, json({ chatId: "-100123", message: "hi" }));
    assert.equal(res.status, 502);
    assert.equal(await res.text(), "Telegram: CHAT_WRITE_FORBIDDEN");
    assert.match(lines[0]!, /telegram send chat=-100123 error="Telegram: CHAT_WRITE_FORBIDDEN"/);
  });
});

describe("health", () => {
  it("reports each platform without a key", async () => {
    const signal = new MockPlatform();
    signal.isReady = async () => {
      throw new Error("signal-api down");
    };
    const { app } = setup({ telegram: new MockPlatform(), signal });
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, telegram: true, signal: false });
  });
});
