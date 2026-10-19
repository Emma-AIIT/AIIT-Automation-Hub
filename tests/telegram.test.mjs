// Unit tests for the pure parts of Telegram direct mode. No network, no login.
//   npm test   (node --test; Node 22.18+ strips the TypeScript types itself)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api, errors } from "telegram";
import {
  CAPTION_LIMIT,
  SESSION_EXPIRED_MESSAGE,
  canPost,
  findDialog,
  isMediaFileName,
  planSends,
  postableGroups,
  telegramErrorMessage,
  withFloodRetry,
} from "../src/lib/server/telegram-helpers.ts";
import { resolveTelegramMode } from "../src/lib/config/telegram-mode.ts";

function chat(fields = {}) {
  return new Api.Chat({ id: bigInt(111), title: "g", photo: new Api.ChatPhotoEmpty(), participantsCount: 2, date: 0, version: 1, ...fields });
}

function channel(fields = {}) {
  return new Api.Channel({ id: bigInt(222), title: "c", photo: new Api.ChatPhotoEmpty(), date: 0, ...fields });
}

function dialog(entity, title = "Group") {
  const isChannel = entity instanceof Api.Channel;
  return {
    entity,
    title,
    isGroup: entity instanceof Api.Chat || (isChannel && Boolean(entity.megagroup)),
    isChannel,
    inputEntity: { marker: title },
  };
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
    assert.equal(canPost(new Api.User({ id: bigInt(1) })), false);
  });
});

describe("dialog filtering and peer ids", () => {
  const dialogs = [
    dialog(chat(), "Basic group"),
    dialog(channel({ megagroup: true }), "Supergroup"),
    dialog(channel({ id: bigInt(333), broadcast: true }), "Someone else's channel"),
    dialog(channel({ id: bigInt(444), broadcast: true, creator: true }), "  Ali's channel  "),
    { entity: new Api.User({ id: bigInt(5) }), title: "A person", isGroup: false, isChannel: false, inputEntity: {} },
  ];

  it("lists postable groups with marked peer ids", () => {
    assert.deepEqual(postableGroups(dialogs), [
      { id: "-111", name: "Basic group" },
      { id: "-100222", name: "Supergroup" },
      { id: "-100444", name: "Ali's channel" },
    ]);
  });

  it("finds a dialog by its marked peer id", () => {
    assert.equal(findDialog(dialogs, "-100222")?.title, "Supergroup");
    assert.equal(findDialog(dialogs, "-111")?.title, "Basic group");
  });

  it("returns undefined when the account is no longer in the chat", () => {
    assert.equal(findDialog(dialogs, "-100999"), undefined);
    // Same number but unmarked (or a basic-group id given as a channel id) must not match.
    assert.equal(findDialog(dialogs, "222"), undefined);
    assert.equal(findDialog(dialogs, "-100111"), undefined);
  });
});

describe("planSends", () => {
  it("sends text alone when there are no files", () => {
    assert.deepEqual(planSends("hi", 0), [{ kind: "text", text: "hi" }]);
    assert.deepEqual(planSends(null, 0), []);
  });

  it("puts the caption on the last file only", () => {
    assert.deepEqual(planSends("hi", 3), [
      { kind: "file", index: 0, caption: undefined },
      { kind: "file", index: 1, caption: undefined },
      { kind: "file", index: 2, caption: "hi" },
    ]);
    assert.deepEqual(planSends(null, 1), [{ kind: "file", index: 0, caption: undefined }]);
  });

  it("sends an over-long caption as its own message after the files", () => {
    const long = "x".repeat(CAPTION_LIMIT + 1);
    assert.deepEqual(planSends(long, 2), [
      { kind: "file", index: 0, caption: undefined },
      { kind: "file", index: 1, caption: undefined },
      { kind: "text", text: long },
    ]);
    const exact = "y".repeat(CAPTION_LIMIT);
    assert.deepEqual(planSends(exact, 1), [{ kind: "file", index: 0, caption: exact }]);
  });

  it("sends images and videos as media, everything else as documents", () => {
    assert.equal(isMediaFileName("photo.JPG"), true);
    assert.equal(isMediaFileName("clip.mp4"), true);
    assert.equal(isMediaFileName("flyer.pdf"), false);
    assert.equal(isMediaFileName("prices.xlsx"), false);
  });
});

function floodWait(seconds) {
  return new errors.FloodWaitError({ request: undefined, capture: seconds });
}

describe("errors and flood waits", () => {
  it("sleeps through a short flood wait once", async () => {
    let calls = 0;
    const waits = [];
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

  it("fails long flood waits with the wait time", async () => {
    const err = floodWait(300);
    let waited = false;
    await assert.rejects(
      withFloodRetry(async () => Promise.reject(err), async () => {
        waited = true;
      }),
      err,
    );
    assert.equal(waited, false);
    assert.equal(telegramErrorMessage(err), "Telegram: rate limited, try again in 300s");
  });

  it("maps RPC errors to their Telegram code", () => {
    const err = new errors.RPCError("CHAT_WRITE_FORBIDDEN", undefined, 403);
    assert.equal(telegramErrorMessage(err), "Telegram: CHAT_WRITE_FORBIDDEN");
  });

  it("maps a revoked or unregistered session to the login hint", () => {
    assert.equal(telegramErrorMessage(new errors.RPCError("AUTH_KEY_UNREGISTERED", undefined, 401)), SESSION_EXPIRED_MESSAGE);
    assert.equal(telegramErrorMessage(new errors.RPCError("SESSION_REVOKED", undefined, 401)), SESSION_EXPIRED_MESSAGE);
    assert.equal(telegramErrorMessage(new Error("401: AUTH_KEY_UNREGISTERED (caused by x)")), SESSION_EXPIRED_MESSAGE);
  });

  it("prefixes plain errors and leaves already-readable ones alone", () => {
    assert.equal(telegramErrorMessage(new Error("socket closed")), "Telegram: socket closed");
    assert.equal(telegramErrorMessage(new Error("Telegram: chat not found")), "Telegram: chat not found");
  });
});

describe("resolveTelegramMode", () => {
  const direct = { apiId: 123, apiHash: "hash", session: "1Aa..." };
  const bridge = { bridgeSyncUrl: "https://b/sync", bridgeSendUrl: "https://b/send" };

  it("prefers direct over bridge", () => {
    assert.equal(resolveTelegramMode({ ...direct, ...bridge }), "direct");
    assert.equal(resolveTelegramMode(direct), "direct");
  });

  it("falls back to the bridge when any direct var is missing", () => {
    assert.equal(resolveTelegramMode({ ...direct, session: undefined, ...bridge }), "bridge");
    assert.equal(resolveTelegramMode(bridge), "bridge");
  });

  it("is null when neither is fully set up", () => {
    assert.equal(resolveTelegramMode({}), null);
    assert.equal(resolveTelegramMode({ apiId: 123, apiHash: "hash" }), null);
    assert.equal(resolveTelegramMode({ bridgeSyncUrl: "https://b/sync" }), null);
  });
});
