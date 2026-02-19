import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '~/env';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - Make.com webhook limit

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const chatId = formData.get('chatId');
    const message = formData.get('message');
    const file = formData.get('file');

    if (typeof chatId !== 'string' || !chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    if (file instanceof File && file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 413 });
    }

    const webhookUrl = env.MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

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
      throw new Error(`Make.com webhook returned ${res.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[whatsapp/send] error:', error);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
