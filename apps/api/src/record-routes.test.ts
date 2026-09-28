import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { issueToken, requireAuth } from './auth.js';
import { createRecordRouter } from './record-routes.js';

describe('Record editing and deletion', () => {
  const id='10000000-0000-4000-8000-000000000001';
  const user={id:'10000000-0000-4000-8000-000000000002',email:'test@example.test',name:'Test',role:'sales' as const};
  const row={id,name:'Test company',title:'Test lead',first_name:'Test',last_name:'Contact',stage:'New',line_user_id:'Utest'};
  const counts={contacts:2,leads:3,messages:4,activities:5,suggestions:6};
  const query=vi.fn();const release=vi.fn();const connect=vi.fn();
  let server:Server;let origin:string;let token:string;
  async function request(entity:string,method:string,body?:unknown,authenticated=true) {
    return fetch(`${origin}/${entity}/${id}`,{method,headers:{'content-type':'application/json',...(authenticated?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  }
  beforeAll(async()=>{
    const app=express();app.use(express.json(),requireAuth,createRecordRouter({connect}));
    server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
    const address=server.address();if(!address||typeof address==='string')throw Error('Missing server');
    origin=`http://127.0.0.1:${address.port}`;token=issueToken(user);
  });
  afterAll(async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
  beforeEach(()=>{
    release.mockReset();connect.mockReset().mockResolvedValue({query,release});
    query.mockReset().mockImplementation(async(sql:string)=>{
      if(sql.startsWith('SELECT *'))return{rows:[row]};
      if(sql.startsWith('SELECT id'))return{rows:[{id}]};
      if(sql.includes('count(*)')) {
        if(sql.includes('FROM contacts'))return{rows:[{contacts:counts.contacts,leads:counts.leads}]};
        if(sql.includes('FROM activities'))return{rows:[{activities:counts.activities,suggestions:counts.suggestions,messages:counts.messages}]};
        return{rows:[{leads:counts.leads,messages:counts.messages}]};
      }
      return{rows:sql.startsWith('UPDATE')?[row]:[]};
    });
  });
  it('requires authentication for editing, previewing and deletion on every entity',async()=>{
    for(const entity of ['companies','contacts','leads']) {
      expect((await request(entity,'PATCH',{name:'Changed'},false)).status).toBe(401);
      expect((await request(entity,'DELETE',{},false)).status).toBe(401);
      expect((await fetch(`${origin}/${entity}/${id}/delete-impact`)).status).toBe(401);
    }
    expect(connect).not.toHaveBeenCalled();
  });
  it('rejects invalid IDs, unsupported fields and out-of-range values before database access',async()=>{
    for(const [entity,body] of [['companies',{}],['companies',{name:''}],['contacts',{line_user_id:'changed'}],['contacts',{email:'invalid'}],['leads',{probability:101}],['leads',{value:-1}],['leads',{stage:'Unknown'}],['leads',{nextFollowUp:'tomorrow'}]])expect((await request(String(entity),'PATCH',body)).status).toBe(400);
    expect((await fetch(`${origin}/leads/not-an-id`,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'})).status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });
  it('preserves numeric zero and clears optional relationships and dates',async()=>{
    expect((await request('leads','PATCH',{value:0,probability:0,companyId:null,contactId:null,nextFollowUp:null})).status).toBe(200);
    const update=query.mock.calls.find(([sql])=>sql.startsWith('UPDATE'))!;
    expect(update[1]).toEqual([null,null,0,0,null,id]);
    expect(update[0]).toContain('company_id=$1');
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');expect(release).toHaveBeenCalledOnce();
  });
  it('logs a stage change and clears the lost reason when reopening a lead',async()=>{
    expect((await request('leads','PATCH',{stage:'Qualified',lossReason:'old reason'})).status).toBe(200);
    expect(query.mock.calls.find(([sql])=>sql.startsWith('UPDATE'))?.[1]).toEqual(['Qualified',null,id]);
    expect(query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO activities'))?.[1]).toEqual([id,user.id,'New → Qualified']);
    expect(query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO audit_logs'))?.[1]).toEqual([user.id,'lead.updated','lead',id,{fields:['stage','lossReason']}]);
  });
  it('rejects a missing related company and rolls back without an update',async()=>{
    query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT *')?[row]:[]}));
    expect((await request('contacts','PATCH',{companyId:id})).status).toBe(400);
    expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('rolls back duplicate records and hides private database error details',async()=>{
    query.mockImplementation(async(sql:string)=>{if(sql.startsWith('UPDATE'))throw Object.assign(new Error('private database connection'),{code:'23505'});return{rows:[row]};});
    const response=await request('companies','PATCH',{name:'Duplicate'});
    expect(response.status).toBe(409);expect(JSON.stringify(await response.json())).not.toContain('private');
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');expect(release).toHaveBeenCalledOnce();
  });
  it('returns 404 and rolls back when the record has already disappeared',async()=>{
    query.mockResolvedValue({rows:[]});expect((await request('leads','PATCH',{title:'Changed'})).status).toBe(404);
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
  it('returns the actual deletion impact including a LINE mapping',async()=>{
    const response=await fetch(`${origin}/contacts/${id}/delete-impact`,{headers:{authorization:`Bearer ${token}`}});
    expect(await response.json()).toEqual({name:'Test Contact',impact:{leads:3,messages:4,lineLinked:true}});
    expect(release).toHaveBeenCalledOnce();
  });
  it('requires an explicit delete confirmation and matching impact counts',async()=>{
    expect((await request('companies','DELETE',{})).status).toBe(400);expect(connect).not.toHaveBeenCalled();
    expect((await request('companies','DELETE',{confirmName:'Old name',expectedImpact:{}})).status).toBe(409);
    expect((await request('companies','DELETE',{confirmName:row.name,expectedImpact:{contacts:1,leads:3,lineLinked:false}})).status).toBe(409);
    expect(query.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);
  });
  it.each([
    ['companies','Test company',{contacts:2,leads:3,lineLinked:false},'company'],
    ['contacts','Test Contact',{leads:3,messages:4,lineLinked:true},'contact'],
    ['leads','Test lead',{activities:5,suggestions:6,messages:4,lineLinked:false},'lead']
  ])('deletes %s and records the deletion in the same transaction',async(entity,name,expectedImpact,singular)=>{
    const response=await request(entity,'DELETE',{confirmName:name,expectedImpact});expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({deleted:{id,entity},impact:expectedImpact});
    expect(query.mock.calls.find(([sql])=>sql.startsWith('DELETE'))).toEqual([`DELETE FROM ${entity} WHERE id=$1`,[id]]);
    expect(query.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO audit_logs'))?.[1]).toEqual([user.id,`${singular}.deleted`,singular,id,{name,impact:expectedImpact}]);
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
  it('rolls back deletion if audit persistence fails',async()=>{
    const original=query.getMockImplementation()!;
    query.mockImplementation(async(...args)=>{if(String(args[0]).startsWith('INSERT INTO audit_logs'))throw Error('private audit failure');return original(...args);});
    const response=await request('companies','DELETE',{confirmName:row.name,expectedImpact:{contacts:2,leads:3,lineLinked:false}});
    expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('private');
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');expect(query.mock.calls.some(([sql])=>sql==='COMMIT')).toBe(false);
  });
});
