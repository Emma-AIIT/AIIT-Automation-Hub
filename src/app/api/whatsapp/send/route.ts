import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getWebhookUrl } from '~/lib/config/whatsapp-accounts';
import type { WhatsAppAccountId } from '~/lib/config/whatsapp-accounts';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - Make.com webhook limit

const VALID_ACCOUNT_IDS: WhatsAppAccountId[] = ['aiit-automation', 'susu-closets', 'gim-foundation', 'aiit-business'];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const chatId = formData.get('chatId');
    const message = formData.get('message');
    const file = formData.get('file');
    const accountIdRaw = formData.get('accountId');

    if (typeof chatId !== 'string' || !chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    if (typeof accountIdRaw !== 'string' || !VALID_ACCOUNT_IDS.includes(accountIdRaw as WhatsAppAccountId)) {
      return NextResponse.json({ error: 'Valid accountId is required' }, { status: 400 });
    }

    if (file instanceof File && file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 413 });
    }

    const accountId = accountIdRaw as WhatsAppAccountId;
    const webhookUrl = getWebhookUrl(accountId, 'sendMessage');

    // Forward as multipart/form-data so Make.com receives the file as binary
    const outForm = new FormData();
    outForm.append('chatId', chatId);
    if (typeof message === 'string' && message.trim()) {
      outForm.append('message', message.trim());
    }
    if (file instanceof File) {
      outForm.append('file', file, file.name);
    }

    const res = await fetch(webhookUrl, { method: 'POST', body: outForm });

    if (!res.ok) {
      let makeError = `Make.com webhook returned ${res.status}`;
      try {
        const body = await res.text();
        if (body) makeError = body;
      } catch { /* ignore */ }
      console.error('[whatsapp/send] Make.com error:', makeError);
      return NextResponse.json({ error: 'Failed to send', makeError }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[whatsapp/send] error:', error);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
