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
    const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:'sales',email:'sales@test.local',name:'Sales',role:'sales'};next();});app.use(createAIRouter({query}));
    server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
    const address=server.address();if(!address||typeof address==='string')throw new Error('No server');origin=`http://127.0.0.1:${address.port}`;
  });
  afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  beforeEach(()=>{
    query.mockReset().mockImplementation(async sql=>{
      if(sql.startsWith('SELECT l.title'))return{rows:[{title:'Website',stage:'New',value:'200000',contact_id:'contact'}]};
      if(sql.startsWith('SELECT content'))return{rows:[{content:'customer budget',direction:'inbound',created_at:'2026-09-28'}]};
      if(sql.startsWith('SELECT body'))return{rows:[{body:'scope note'}]};
      if(sql.startsWith('INSERT INTO ai_suggestions'))return{rows:[suggestion]};
      return{rows:[]};
    });
    vi.mocked(analyzeLead).mockReset().mockResolvedValue(suggestion as any);
  });
  afterEach(()=>vi.unstubAllEnvs());
  it('saves a successful result and includes conversations and notes',async()=>{
    const res=await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST'});
    expect(res.status).toBe(200);expect(await res.json()).toEqual({suggestion});
    expect(analyzeLead).toHaveBeenCalledWith({title:'Website',stage:'New',value:200000,messages:[{content:'customer budget',direction:'inbound',created_at:'2026-09-28'}],activities:[{body:'scope note'}],files:[],additionalNote:''});
    expect(query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO ai_suggestions'))?.[1]).toEqual([id,{...suggestion.result,inputSources:{messages:1,activities:1,files:[],additionalNote:false}},suggestion.provider,'sales']);
  });
  it('analyzes uploaded CSV and note together with ALL database conversations and timeline entries',async()=>{
    const messages=Array.from({length:30},(_,index)=>({id:`m${index}`,content:index===0?'x'.repeat(13000):`message ${index}`,direction:'outbound',status:index===0?'draft':'sent',created_at:'2026-09-28'}));
    const activities=Array.from({length:15},(_,index)=>({id:`a${index}`,body:`note ${index}`,type:'note',created_at:'2026-09-28',actor:'Sales'}));
    const original=query.getMockImplementation()!;
    query.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT content')?{rows:messages}:sql.startsWith('SELECT body')?{rows:activities}:original(sql,...args));
    const body=new FormData();body.append('files',new Blob(['topic,value\nbudget,350000']), 'budget.csv');body.append('note','ผู้อนุมัติคือคุณสมชาย');
    const res=await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST',body});expect(res.status).toBe(200);
    const context=vi.mocked(analyzeLead).mock.calls[0][0];expect(context.messages).toEqual(messages);expect(context.activities).toEqual(activities);expect(context.additionalNote).toBe('ผู้อนุมัติคือคุณสมชาย');expect(context.files?.[0].content).toContain('350000');
    const messageSql=query.mock.calls.find(([sql])=>sql.startsWith('SELECT content'))?.[0];expect(messageSql).not.toContain('LIMIT');expect(messageSql).not.toContain('status IN');expect(messageSql).toContain('owner_id=$4');
    const activitySql=query.mock.calls.find(([sql])=>sql.startsWith('SELECT body'))?.[0];expect(activitySql).not.toContain('LIMIT');
    const saved=query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO ai_suggestions'))?.[1][1];expect(saved.inputSources.messages).toBe(30);expect(saved.inputSources.activities).toBe(15);expect(saved.inputSources.files[0]).toMatchObject({name:'budget.csv',rowCount:2});expect(saved.inputSources.files[0]).not.toHaveProperty('content');
  });
  it('does not call AI or save anything if attachment parsing fails',async()=>{
    const body=new FormData();body.append('files',new Blob(['broken']), 'bad.xlsx');
    const res=await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST',body});expect(res.status).toBe(422);expect((await res.json()).code).toBe('unreadable_file');expect(analyzeLead).not.toHaveBeenCalled();expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  });
  it('checks lead ownership before reading uploaded files',async()=>{
    query.mockResolvedValue({rows:[]});const body=new FormData();body.append('files',new Blob(['broken']), 'bad.xlsx');
    const res=await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST',body});expect(res.status).toBe(404);expect(query.mock.calls[0][1]).toEqual([id,false,'sales']);expect(analyzeLead).not.toHaveBeenCalled();
  });
  it('rejects oversized full context instead of silently cutting history',async()=>{
    const original=query.getMockImplementation()!;query.mockImplementation(async(sql,...args)=>sql.startsWith('SELECT content')?{rows:[{content:'x'.repeat(100001)}]}:original(sql,...args));
    const res=await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST'});expect(res.status).toBe(413);expect((await res.json()).code).toBe('context_too_large');expect(analyzeLead).not.toHaveBeenCalled();expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  });
  it('does not persist suggestions when OpenAI fails',async()=>{
    vi.mocked(analyzeLead).mockRejectedValue(new AIError('openai_limit','ตรวจเครดิต',429));
    const res=await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST'});
    expect(res.status).toBe(429);expect(await res.json()).toEqual({error:'ตรวจเครดิต',code:'openai_limit'});
    expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  });
  it.each(['Won','Lost'])('rejects analysis of a %s lead before calling AI or saving anything',async stage=>{
    query.mockResolvedValue({rows:[{title:'Closed opportunity',stage,value:'200000',contact_id:'contact'}]});
    const res=await fetch(`${origin}/ai/leads/${id}/analyze`,{method:'POST'});
    expect(res.status).toBe(409);expect((await res.json()).code).toBe('lead_closed');
    expect(query).toHaveBeenCalledTimes(1);
    expect(analyzeLead).not.toHaveBeenCalled();
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
