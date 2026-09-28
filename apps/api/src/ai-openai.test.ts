import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeLead } from './ai.js';

const context={title:'Website project',stage:'New',source:'LINE',value:null,company:null,contact:null,messages:['ลูกค้ามีงบ 200000 บาท ต้องการเว็บไซต์ในสองเดือน'],activities:[]};
const result={summary:'ลูกค้าต้องการเว็บไซต์ มีงบ 200000 บาท และกรอบเวลาสองเดือน',score:68,scoreReasons:['ระบุงบประมาณและกรอบเวลาในข้อความ'],missingInformation:['ผู้อนุมัติ'],nextBestAction:'นัดคุยขอบเขตงาน',lineReplyDraft:'สะดวกนัดคุยรายละเอียดเว็บไซต์ไหมครับ'};
describe('OpenAI analysis',()=>{
  const fetchMock=vi.fn();
  beforeEach(()=>{vi.stubEnv('AI_PROVIDER','openai');vi.stubEnv('AI_MODEL','gpt-4o-mini');vi.stubEnv('OPENAI_API_KEY','test-private-key');vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();});
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
  const response=(content:unknown=result,finish_reason='stop',refusal:string|null=null)=>new Response(JSON.stringify({choices:[{finish_reason,message:{content:JSON.stringify(content),refusal}}]}),{status:200});
  it('sends the actual context to OpenAI and returns validated semantic output',async()=>{
    fetchMock.mockResolvedValue(response());
    expect(await analyzeLead(context)).toEqual({result,provider:'gpt-4o-mini'});
    const [url,options]=fetchMock.mock.lastCall!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body=JSON.parse(options.body);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(JSON.parse(body.messages[1].content)).toEqual(context);
    expect(body.store).toBe(false);
  });
  it('fails clearly when the OpenAI key is missing, with no fallback result',async()=>{
    vi.stubEnv('OPENAI_API_KEY','');
    await expect(analyzeLead(context)).rejects.toMatchObject({code:'openai_not_configured'});
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([[401,'openai_auth_failed'],[403,'openai_auth_failed'],[429,'openai_limit'],[500,'openai_unavailable'],[400,'openai_request_invalid']])('handles HTTP %i without saving fake analysis',async(status,code)=>{
    fetchMock.mockResolvedValue(new Response('private provider details',{status:Number(status)}));
    await expect(analyzeLead(context)).rejects.toMatchObject({code});
  });
  it.each([{...result,score:101},{...result,scoreReasons:[5]},{...result,lineReplyDraft:null}])('rejects invalid output fields',async invalid=>{
    fetchMock.mockResolvedValue(response(invalid));
    await expect(analyzeLead(context)).rejects.toMatchObject({code:'openai_invalid_output'});
  });
  it('rejects malformed JSON',async()=>{
    fetchMock.mockResolvedValue(new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'bad json'}}]})));
    await expect(analyzeLead(context)).rejects.toMatchObject({code:'openai_invalid_output'});
  });
  it('handles refusal and incomplete generation',async()=>{
    fetchMock.mockResolvedValueOnce(response(result,'stop','refused')).mockResolvedValueOnce(response(result,'length'));
    await expect(analyzeLead(context)).rejects.toMatchObject({code:'openai_refusal'});
    await expect(analyzeLead(context)).rejects.toMatchObject({code:'openai_incomplete'});
  });
  it('handles timeouts without leaking request credentials',async()=>{
    fetchMock.mockRejectedValue(new DOMException('private provider details','TimeoutError'));
    await expect(analyzeLead(context)).rejects.toMatchObject({code:'openai_timeout',status:504});
  });
});
