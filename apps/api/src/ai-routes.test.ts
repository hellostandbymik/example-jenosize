import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { createAIRouter } from './ai-routes.js';
import { AIError } from './ai.js';

vi.mock('./ai.js',async importOriginal=>({...await importOriginal<typeof import('./ai.js')>(),analyzeLead:vi.fn()}));
import { analyzeLead } from './ai.js';
describe('AI analysis routes',()=>{
  let server:Server;let origin:string;
  const query=vi.fn();const id='00000000-0000-4000-8000-000000000001';
  const suggestion={id:'suggestion',provider:'gpt-4o-mini',result:{summary:'real output'}};
  beforeAll(async()=>{
    const app=express();app.use((req,_res,next)=>{req.user={id:'sales',email:'sales@test.local',name:'Sales',role:'sales'};next();});app.use(createAIRouter({query}));
    server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
    const address=server.address();if(!address||typeof address==='string')throw new Error('No server');origin=`http://127.0.0.1:${address.port}`;
  });
  afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  beforeEach(()=>{
    query.mockReset().mockImplementation(async sql=>{
      if(sql.startsWith('SELECT l.title'))return{rows:[{title:'Website',value:'200000',contact_id:'contact'}]};
      if(sql.startsWith('SELECT content'))return{rows:[{content:'customer budget',direction:'inbound',created_at:'2026-09-28'}]};
      if(sql.startsWith('SELECT body'))return{rows:[{body:'scope note'}]};
      if(sql.startsWith('INSERT INTO ai_suggestions'))return{rows:[suggestion]};
      return{rows:[]};
    });
    vi.mocked(analyzeLead).mockReset().mockResolvedValue(suggestion as any);
  });
  afterEach(()=>vi.unstubAllEnvs());
  it('saves a successful result and includes delivered conversations and notes',async()=>{
    const res=await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST'});
    expect(res.status).toBe(200);expect(await res.json()).toEqual({suggestion});
    expect(analyzeLead).toHaveBeenCalledWith({title:'Website',value:200000,messages:[{content:'customer budget',direction:'inbound',created_at:'2026-09-28'}],activities:['scope note']});
    expect(query.mock.calls.find(([sql])=>sql.startsWith('SELECT content'))?.[0]).toContain("status IN ('received','sent')");
    expect(query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO ai_suggestions'))?.[1]).toEqual([id,suggestion.result,suggestion.provider,'sales']);
  });
  it('does not persist suggestions when OpenAI fails',async()=>{
    vi.mocked(analyzeLead).mockRejectedValue(new AIError('openai_limit','ตรวจเครดิต',429));
    const res=await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST'});
    expect(res.status).toBe(429);expect(await res.json()).toEqual({error:'ตรวจเครดิต',code:'openai_limit'});
    expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  });
  it('returns a safe JSON response if saving fails',async()=>{
    query.mockRejectedValue(new Error('private database details'));
    const res=await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST'});
    expect(res.status).toBe(503);expect(JSON.stringify(await res.json())).not.toContain('private');
  });
  it('rejects invalid and nonexistent leads',async()=>{
    expect((await fetch(`${origin}/ai/leads/invalid/analyze`,{method:'POST'})).status).toBe(400);
    expect(query).not.toHaveBeenCalled();query.mockResolvedValue({rows:[]});
    expect((await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST'})).status).toBe(404);
  });
  it('exposes only configuration readiness and model, never the key',async()=>{
    vi.stubEnv('AI_PROVIDER','openai');vi.stubEnv('OPENAI_API_KEY','private-test-key');vi.stubEnv('AI_MODEL','gpt-4o-mini');
    expect(await (await fetch(`${origin}/ai/config`)).json()).toEqual({provider:'openai',model:'gpt-4o-mini',configured:true});
  });
});
