import { createHmac, timingSafeEqual } from 'node:crypto';
export function verifyLineSignature(rawBody: Buffer, signature: string|undefined, secret: string|undefined): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(expected); const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a,b);
}
export function lineEventKey(event: any): string {
  return String(event.webhookEventId || `${event.timestamp}:${event.source?.userId || 'unknown'}:${event.message?.id || event.type || 'event'}`);
}
export async function sendLineText(to: string, text: string) {
  if (process.env.LINE_MODE === 'mock') return `mock-${Date.now()}`;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('LINE is not configured');
  const r = await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({to,messages:[{type:'text',text}]})});
  if(!r.ok) throw new Error(`LINE send failed (${r.status})`);
  return r.headers.get('x-line-request-id');
}
