import { describe,it,expect } from 'vitest';
import { analyzeLead } from './ai.js';
import { createHmac } from 'node:crypto';
import { lineEventKey, sendLineText, verifyLineSignature } from './line.js';

describe('CRM copilot safe fallback',()=>{
  it('returns a conservative structured suggestion without an AI key',async()=>{
    const previousProvider=process.env.AI_PROVIDER; const previousKey=process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY; process.env.AI_PROVIDER='mock';
    const {result,provider}=await analyzeLead({title:'Discovery',stage:'New',source:'Website',value:null,company:null,contact:null,messages:[],activities:[]});
    expect(provider).toBe('safe-fallback'); expect(result.score).toBeGreaterThanOrEqual(0); expect(result.score).toBeLessThan(70); expect(result.missingInformation.length).toBeGreaterThan(0); expect(result.lineReplyDraft).toContain('Discovery');
    if(previousProvider===undefined)delete process.env.AI_PROVIDER;else process.env.AI_PROVIDER=previousProvider;if(previousKey!==undefined)process.env.OPENAI_API_KEY=previousKey;
  });
});
describe('LINE webhook signature guard',()=>{
  it('accepts only a matching HMAC signature for the exact raw payload',()=>{
    const body=Buffer.from('{"events":[]}');const secret='test-channel-secret';const signature=createHmac('sha256',secret).update(body).digest('base64');
    expect(verifyLineSignature(body,signature,secret)).toBe(true);expect(verifyLineSignature(body,signature,`${secret}!`)).toBe(false);expect(verifyLineSignature(Buffer.from('{}'),signature,secret)).toBe(false);expect(verifyLineSignature(body,undefined,secret)).toBe(false);
  });
  it('derives the same idempotency key for duplicate deliveries of one LINE event',()=>{
    const event={webhookEventId:'01HLINEEVENT',timestamp:1727000000,source:{userId:'U123'},message:{id:'M456'},type:'message'};
    expect(lineEventKey(event)).toBe('01HLINEEVENT');expect(lineEventKey({...event})).toBe(lineEventKey(event));
  });
  it('uses the local mock sender without credentials',async()=>{
    const previous=process.env.LINE_MODE;process.env.LINE_MODE='mock';
    await expect(sendLineText('U-SYNTHETIC','hello')).resolves.toMatch(/^mock-/);
    if(previous===undefined)delete process.env.LINE_MODE;else process.env.LINE_MODE=previous;
  });
});
