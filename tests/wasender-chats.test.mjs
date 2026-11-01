// Unit tests for the Exchange HQ WaSender logic, run against a local mock of the
// responses in https://wasenderapi.com/api-docs. Nothing reaches WaSender.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import {
  OPT_OUT_LINE,
  buildSendRequests,
  chatKind,
  contactToChat,
  createWasenderGet,
  fetchAllPages,
  groupToChat,
  isGroupChat,
  listChats,
  sendTarget,
  wasenderErrorMessage,
} from "../src/lib/wasender-chats.ts";

describe("telling groups from people", () => {
  it("labels by id", () => {
    assert.equal(chatKind("123-456@g.us"), "Group");
    assert.equal(chatKind("61400000000@s.whatsapp.net"), "Person");
    assert.equal(chatKind("123@lid"), "Person");
    assert.equal(chatKind("61400000000"), "Person");
    assert.equal(isGroupChat("61400000000@s.whatsapp.net"), false);
  });
});

describe("names", () => {
  it("uses the saved name, then business and display names, then the number", () => {
    const jid = "61400000000@s.whatsapp.net";
    assert.equal(contactToChat({ jid, name: "Sam", notify: "x" }).name, "Sam");
    assert.equal(contactToChat({ jid, verifiedName: "Acme", notify: "x" }).name, "Acme");
    assert.equal(contactToChat({ jid, notify: "Sammy" }).name, "Sammy");
    assert.equal(contactToChat({ jid, name: "  " }).name, "+61400000000");
    assert.equal(contactToChat({ jid: "61400000000" }).name, "+61400000000");
  });

  it("never shows a LID as a number", () => {
    assert.equal(contactToChat({ jid: "123@lid" }).name, "Unknown contact");
  });

  it("names a group", () => {
    assert.deepEqual(groupToChat({ jid: "1-2@g.us", name: "Team" }), { id: "1-2@g.us", name: "Team" });
    assert.equal(groupToChat({ jid: "1-2@g.us", name: null }).name, "Unnamed group");
  });

  it("drops ids that cannot be messaged", () => {
    assert.equal(contactToChat({ jid: "status@broadcast" }), null);
    assert.equal(contactToChat({ jid: "1-2@g.us" }), null);
    assert.equal(contactToChat({}), null);
    assert.equal(groupToChat({ jid: "61400000000@s.whatsapp.net" }), null);
  });
});

describe("pagination", () => {
  const pages = (lists) => async (path) => {
    const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
    return { success: true, data: { items: lists[page - 1] ?? [], pagination: { totalPages: lists.length } } };
  };

  it("reads every page", async () => {
    assert.deepEqual(await fetchAllPages(pages([[1, 2], [3], [4]]), "/api/contacts"), [1, 2, 3, 4]);
  });

  it("copes with a plain array", async () => {
    assert.deepEqual(await fetchAllPages(async () => ({ data: [1, 2] }), "/api/groups"), [1, 2]);
  });

  it("stops on an empty page when there is no page count", async () => {
    let calls = 0;
    const get = async () => ({ data: { items: calls++ === 0 ? [1] : [] } });
    assert.deepEqual(await fetchAllPages(get, "/api/groups"), [1]);
    assert.equal(calls, 2);
  });

  it("throws on a shape it does not know, instead of an empty list", async () => {
    await assert.rejects(fetchAllPages(async () => ({ data: { nope: 1 } }), "/api/groups"), /unexpected/);
    await assert.rejects(fetchAllPages(async () => null, "/api/groups"), /unexpected/);
  });
});

describe("send requests", () => {
  const url = (n) => `https://x/${n}.png`;

  it("addresses groups by JID and individuals in E.164", () => {
    assert.equal(sendTarget("1-2@g.us"), "1-2@g.us");
    assert.equal(sendTarget("61400000000@s.whatsapp.net"), "+61400000000");
    assert.equal(sendTarget("61400000000"), "+61400000000");
    assert.equal(sendTarget("+61400000000"), "+61400000000");
    assert.equal(sendTarget("123@lid"), "123@lid");
  });

  it("adds the opt-out line for people only", () => {
    assert.deepEqual(buildSendRequests({ chatId: "1-2@g.us", message: "Hi", imageUrls: [] }), [
      { to: "1-2@g.us", text: "Hi" },
    ]);
    assert.deepEqual(buildSendRequests({ chatId: "61400000000@s.whatsapp.net", message: "Hi", imageUrls: [] }), [
      { to: "+61400000000", text: `Hi\n\n${OPT_OUT_LINE}` },
    ]);
    assert.equal(buildSendRequests({ chatId: "123@lid", message: "Hi", imageUrls: [] })[0].text, `Hi\n\n${OPT_OUT_LINE}`);
  });

  it("puts the caption on the last image only", () => {
    assert.deepEqual(buildSendRequests({ chatId: "1-2@g.us", message: "Hi", imageUrls: [url(1), url(2)] }), [
      { to: "1-2@g.us", imageUrl: url(1) },
      { to: "1-2@g.us", imageUrl: url(2), text: "Hi" },
    ]);
  });

  it("sends image-only broadcasts without text to groups, with the opt-out to people", () => {
    assert.deepEqual(buildSendRequests({ chatId: "1-2@g.us", message: null, imageUrls: [url(1)] }), [
      { to: "1-2@g.us", imageUrl: url(1) },
    ]);
    assert.deepEqual(buildSendRequests({ chatId: "61400000000", message: null, imageUrls: [url(1)] }), [
      { to: "+61400000000", imageUrl: url(1), text: OPT_OUT_LINE },
    ]);
  });
});

describe("errors", () => {
  it("explains a rejected key, and otherwise passes on WaSender's words", () => {
    assert.match(wasenderErrorMessage(401, { message: "Invalid API key" }), /rejected the API key/);
    assert.equal(
      wasenderErrorMessage(400, { message: "Your Whatsapp Session is not connected please connect your session first." }),
      "Exchange HQ: Your Whatsapp Session is not connected please connect your session first.",
    );
    assert.equal(wasenderErrorMessage(422, { error: "Phone number not found or invalid." }), "Exchange HQ: Phone number not found or invalid.");
    assert.equal(wasenderErrorMessage(500, null), "Exchange HQ: WaSender returned HTTP 500");
  });
});

describe("listChats against a mock server", () => {
  const KEY = "test-key";
  const groupsPages = [[{ jid: "1-2@g.us", name: "Team", imgUrl: null }]];
  const contactsPages = [
    [
      { jid: "61400000001@s.whatsapp.net", name: "Sam" },
      { jid: "61400000002@s.whatsapp.net" },
    ],
    [
      { jid: "99@lid", notify: "Lee" },
      { jid: "status@broadcast" },
    ],
  ];
  let status = "connected";
  let server;
  let base;

  before(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      const send = (code, body) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.headers.authorization !== `Bearer ${KEY}`) {
        return send(401, { success: false, message: "Invalid API key" });
      }
      if (url.pathname === "/api/status") return send(200, { status });
      const lists = url.pathname === "/api/groups" ? groupsPages : contactsPages;
      assert.equal(url.searchParams.get("paginated"), "true");
      const page = Number(url.searchParams.get("page"));
      return send(200, {
        success: true,
        data: { items: lists[page - 1], pagination: { total: 9, page, limit: 100, totalPages: lists.length } },
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  it("returns every group and contact, with readable names", async () => {
    status = "connected";
    assert.deepEqual(await listChats(createWasenderGet(KEY, base)), [
      { id: "1-2@g.us", name: "Team" },
      { id: "61400000001@s.whatsapp.net", name: "Sam" },
      { id: "61400000002@s.whatsapp.net", name: "+61400000002" },
      { id: "99@lid", name: "Lee" },
    ]);
  });

  it("gives a readable error for a disconnected session", async () => {
    status = "logged_out";
    await assert.rejects(listChats(createWasenderGet(KEY, base)), /not connected \(logged out\)/);
  });

  it("gives a readable error for a rejected key, without the key", async () => {
    await assert.rejects(listChats(createWasenderGet("bad-key", base)), (err) => {
      assert.match(err.message, /rejected the API key/);
      assert.doesNotMatch(err.message, /bad-key/);
      return true;
    });
  });
});
