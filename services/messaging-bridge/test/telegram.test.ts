import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Api } from "telegram";
import { FloodWaitError, RPCError } from "telegram/errors";
import { canPost, toTelegramError, withFloodRetry } from "../src/telegram";

function chat(fields: Partial<ConstructorParameters<typeof Api.Chat>[0]> = {}) {
  return new Api.Chat({ id: 1 as never, title: "g", photo: new Api.ChatPhotoEmpty(), participantsCount: 2, date: 0, version: 1, ...fields });
}

function channel(fields: Partial<ConstructorParameters<typeof Api.Channel>[0]> = {}) {
  return new Api.Channel({ id: 1 as never, title: "c", photo: new Api.ChatPhotoEmpty(), date: 0, ...fields });
}

describe("canPost", () => {
  it("includes basic groups and supergroups the user is in", () => {
    assert.equal(canPost(chat()), true);
    assert.equal(canPost(channel({ megagroup: true })), true);
  });

  it("excludes left, deactivated and read-only chats", () => {
    assert.equal(canPost(chat({ left: true })), false);
    assert.equal(canPost(chat({ deactivated: true })), false);
    assert.equal(canPost(channel({ megagroup: true, left: true })), false);
    const muted = new Api.ChatBannedRights({ untilDate: 0, sendMessages: true });
    assert.equal(canPost(channel({ megagroup: true, defaultBannedRights: muted })), false);
  });

  it("includes broadcast channels only for the creator or posting admins", () => {
    assert.equal(canPost(channel({ broadcast: true })), false);
    assert.equal(canPost(channel({ broadcast: true, creator: true })), true);
    const poster = new Api.ChatAdminRights({ postMessages: true });
    assert.equal(canPost(channel({ broadcast: true, adminRights: poster })), true);
  });

  it("excludes users and missing entities", () => {
    assert.equal(canPost(undefined), false);
    assert.equal(canPost(new Api.User({ id: 1 as never })), false);
  });
});

function floodWait(seconds: number) {
  const err = new FloodWaitError({ request: undefined, capture: seconds });
  return err;
}

describe("flood handling", () => {
  it("sleeps through a short flood wait once", async () => {
    let calls = 0;
    const waits: number[] = [];
    const result = await withFloodRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw floodWait(5);
        return "sent";
      },
      async (ms) => {
        waits.push(ms);
      },
    );
    assert.equal(result, "sent");
    assert.deepEqual(waits, [5000]);
  });

  it("gives up on long flood waits with a 429", async () => {
    const err = floodWait(300);
    await assert.rejects(withFloodRetry(async () => Promise.reject(err)), err);
    const mapped = toTelegramError(err);
    assert.equal(mapped.status, 429);
    assert.equal(mapped.message, "Telegram: rate limited, try again in 300s");
  });

  it("maps RPC errors to their Telegram code", () => {
    const mapped = toTelegramError(new RPCError("CHAT_WRITE_FORBIDDEN", undefined as never, 403));
    assert.equal(mapped.message, "Telegram: CHAT_WRITE_FORBIDDEN");
  });
});
