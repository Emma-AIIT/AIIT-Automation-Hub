import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeError } from "../src/platform";
import { SignalPlatform } from "../src/signal";

const NUMBER = "+61400000000";

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  }) as typeof fetch;
  return { impl, calls };
}

describe("SignalPlatform", () => {
  it("lists groups, skipping blocked ones and ones we left", async () => {
    const { impl, calls } = fakeFetch(() =>
      Response.json([
        { id: "group.aaa", name: "Clients", blocked: false },
        { id: "group.bbb", name: "Blocked", blocked: true },
        { id: "group.ccc", name: "Left", blocked: false, member: false },
        { id: "group.ddd", name: "" },
      ]),
    );
    const signal = new SignalPlatform({ number: NUMBER, apiUrl: "http://signal-api:8080/" }, impl);
    assert.deepEqual(await signal.syncGroups(), [
      { id: "group.aaa", name: "Clients" },
      { id: "group.ddd", name: "(unnamed group)" },
    ]);
    assert.equal(calls[0]?.url, "http://signal-api:8080/v1/groups/%2B61400000000");
  });

  it("sends text and attachments through /v2/send", async () => {
    const { impl, calls } = fakeFetch(() => Response.json({ timestamp: "1" }, { status: 201 }));
    const signal = new SignalPlatform({ number: NUMBER, apiUrl: "http://signal-api:8080" }, impl);
    await signal.send({
      chatId: "group.aaa",
      message: "See attached",
      file: { name: "a;b,c.pdf", type: "application/pdf", data: Buffer.from("hi") },
    });
    assert.equal(calls[0]?.url, "http://signal-api:8080/v2/send");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      number: NUMBER,
      message: "See attached",
      recipients: ["group.aaa"],
      base64_attachments: ["data:application/pdf;filename=a_b_c.pdf;base64,aGk="],
    });
  });

  it("turns signal-api errors into readable messages", async () => {
    const { impl } = fakeFetch(() => Response.json({ error: "Failed to send message: group not found" }, { status: 400 }));
    const signal = new SignalPlatform({ number: NUMBER, apiUrl: "http://signal-api:8080" }, impl);
    await assert.rejects(signal.send({ chatId: "group.zzz", message: "hi" }), (err: unknown) => {
      assert.ok(err instanceof BridgeError);
      assert.equal(err.message, "Signal: Failed to send message: group not found");
      return true;
    });
  });

  it("is ready only when the number is a linked account", async () => {
    const linked = new SignalPlatform({ number: NUMBER, apiUrl: "http://x" }, fakeFetch(() => Response.json([NUMBER])).impl);
    const other = new SignalPlatform({ number: NUMBER, apiUrl: "http://x" }, fakeFetch(() => Response.json([])).impl);
    assert.equal(await linked.isReady(), true);
    assert.equal(await other.isReady(), false);
  });
});
