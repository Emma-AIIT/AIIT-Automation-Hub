/**
 * Pure WaSender logic for the Exchange HQ account: reading the number's groups and
 * contacts, telling them apart, and building send requests. Takes its API key as an
 * argument and reads no env, so it is unit-tested (tests/wasender-chats.test.mjs) and
 * its id helpers are safe in client components. The server wrapper is wasender.ts.
 *
 * What the API offers (https://wasenderapi.com/api-docs):
 *   - GET /api/status: { status: "connected" | "need_scan" | "logged_out" | ... }
 *   - GET /api/groups: items { jid: "...@g.us", name, imgUrl }
 *   - GET /api/contacts: items { jid, name, notify, verifiedName, imgUrl, status }
 *   Both lists take paginated=true&page&limit and then return
 *   { data: { items, pagination: { total, page, limit, totalPages } } }.
 *   There is no endpoint listing chats, so individuals come from the contacts the
 *   session has synced. A contact jid can be "614...@s.whatsapp.net", "123...@lid"
 *   (a WhatsApp internal id, NOT a phone number) or bare digits, as the docs show.
 *   - POST /api/send-message: `to` is a group JID, an E.164 number or a WhatsApp JID.
 */

export const WASENDER_API_BASE = 'https://www.wasenderapi.com';

/** Added to messages to individuals, so people who never opted in have a way out. */
export const OPT_OUT_LINE = 'Reply STOP to opt out.';

const PAGE_SIZE = 100;
/** Stops a bad pagination response looping for ever. 100,000 chats is well past real. */
const MAX_PAGES = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

export type WasenderChat = { id: string; name: string };
type RawGroup = { jid?: unknown; name?: unknown };
type RawContact = RawGroup & { notify?: unknown; verifiedName?: unknown };

/** Fetches one API path and returns its parsed JSON. Throws a readable Error. */
export type WasenderGet = (path: string) => Promise<unknown>;

export function isGroupChat(id: string): boolean {
  return id.endsWith('@g.us');
}

/** "Group" or "Person", for the label in the chat list. */
export function chatKind(id: string): 'Group' | 'Person' {
  return isGroupChat(id) ? 'Group' : 'Person';
}

/** Digits of a contact id that is a real phone number. Null for a LID or anything else. */
function phoneDigits(id: string): string | null {
  return /^\+?(\d+)(@s\.whatsapp\.net)?$/.exec(id)?.[1] ?? null;
}

/** What goes in `to`. E.164 where there is a number, otherwise the id unchanged. */
export function sendTarget(id: string): string {
  const digits = phoneDigits(id);
  return digits ? `+${digits}` : id;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Only ids a message can be sent to, which leaves out status@broadcast and the like. */
function isPersonId(id: string): boolean {
  return phoneDigits(id) !== null || id.endsWith('@lid');
}

export function groupToChat(group: RawGroup): WasenderChat | null {
  const id = text(group.jid);
  if (!isGroupChat(id)) return null;
  return { id, name: text(group.name) || 'Unnamed group' };
}

/** Saved name first, then the number. A LID is not a number, so it is not shown as one. */
export function contactToChat(contact: RawContact): WasenderChat | null {
  const id = text(contact.jid);
  if (!isPersonId(id)) return null;
  const digits = phoneDigits(id);
  const name =
    text(contact.name) ||
    text(contact.verifiedName) ||
    text(contact.notify) ||
    (digits ? `+${digits}` : 'Unknown contact');
  return { id, name };
}

function readPage(json: unknown): { items: unknown[]; totalPages: number | null } {
  const data = (json as { data?: unknown } | null)?.data;
  if (Array.isArray(data)) return { items: data as unknown[], totalPages: 1 };
  const paged = data as { items?: unknown; pagination?: { totalPages?: unknown } } | null | undefined;
  if (!Array.isArray(paged?.items)) {
    throw new Error('Exchange HQ: WaSender returned an unexpected response.');
  }
  const totalPages = paged.pagination?.totalPages;
  return { items: paged.items as unknown[], totalPages: typeof totalPages === 'number' ? totalPages : null };
}

/** Reads every page. Throws rather than return part of a list, as sync deletes what is missing. */
export async function fetchAllPages(get: WasenderGet, path: string): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { items, totalPages } = readPage(await get(`${path}?paginated=true&page=${page}&limit=${PAGE_SIZE}`));
    all.push(...items);
    if (totalPages !== null ? page >= totalPages : items.length === 0) return all;
  }
  throw new Error('Exchange HQ: WaSender returned too many pages, so nothing was changed.');
}

/** Refuses to read lists from a session that isn't connected. */
async function assertConnected(get: WasenderGet): Promise<void> {
  const json = (await get('/api/status')) as { status?: unknown; data?: { status?: unknown } } | null;
  const raw = json?.status ?? json?.data?.status;
  const status = typeof raw === 'string' ? raw.toLowerCase() : null;
  if (status && status !== 'connected') {
    throw new Error(
      `Exchange HQ: the WhatsApp session is not connected (${status.replace(/_/g, ' ')}). ` +
        `Reconnect it in WaSender, then refresh.`,
    );
  }
}

/** Every group and contact on the connected number. Throws if any part fails. */
export async function listChats(get: WasenderGet): Promise<WasenderChat[]> {
  await assertConnected(get);
  const groups = (await fetchAllPages(get, '/api/groups')) as RawGroup[];
  const contacts = (await fetchAllPages(get, '/api/contacts')) as RawContact[];
  return [
    ...groups.map(groupToChat),
    ...contacts.map(contactToChat),
  ].filter((chat): chat is WasenderChat => chat !== null);
}

/** Readable text for a failed WaSender response. Never includes the key. */
export function wasenderErrorMessage(status: number, body: unknown): string {
  if (status === 401 || status === 403) {
    return 'Exchange HQ: WaSender rejected the API key. Check WASENDER_API_KEY.';
  }
  const json = body as { message?: unknown; error?: unknown } | null;
  const detail = text(json?.message) || text(json?.error);
  return `Exchange HQ: ${detail || `WaSender returned HTTP ${status}`}`;
}

/** A WasenderGet that calls the real API, or a test server through baseUrl. */
export function createWasenderGet(apiKey: string, baseUrl: string = WASENDER_API_BASE): WasenderGet {
  return async (path) => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new Error('Exchange HQ: could not reach WaSender. Try again in a minute.');
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new Error(wasenderErrorMessage(res.status, json));
    return json;
  };
}

/**
 * The send-message bodies for one recipient. Each image is its own message and the
 * caption rides on the last, matching sendToGroup. Only individuals get the opt-out
 * line, which also captions an image sent to them with no message.
 */
export function buildSendRequests(opts: {
  chatId: string;
  message: string | null;
  imageUrls: string[];
}): Record<string, string>[] {
  const { chatId, message, imageUrls } = opts;
  const to = sendTarget(chatId);
  const body = isGroupChat(chatId)
    ? message
    : message
      ? `${message}\n\n${OPT_OUT_LINE}`
      : OPT_OUT_LINE;

  if (imageUrls.length === 0) return [{ to, text: body ?? '' }];

  return imageUrls.map((imageUrl, i) => ({
    to,
    imageUrl,
    ...(i === imageUrls.length - 1 && body ? { text: body } : {}),
  }));
}
