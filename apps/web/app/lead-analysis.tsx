'use client';
import { useEffect, useState } from 'react';

type Analysis = {summary:string;score:number;scoreReasons:string[];missingInformation:string[];nextBestAction:string;lineReplyDraft:string};
type Suggestion = {id:string;provider:string;created_at:string;result:Analysis};
type Props = {leadId:string;initialSuggestion?:Suggestion;call:(path:string,options?:RequestInit)=>Promise<any>;createDraft:(text:string)=>Promise<void>};

export default function LeadAnalysis({leadId,initialSuggestion,call,createDraft}:Props) {
  const [suggestion,setSuggestion]=useState(initialSuggestion);
  const [draft,setDraft]=useState(initialSuggestion?.result.lineReplyDraft || '');
  const [config,setConfig]=useState<{provider:string;model:string;configured:boolean}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    call('/api/ai/config',{signal:controller.signal}).then(setConfig).catch(()=>{});
    return ()=>controller.abort();
  },[call]);
  async function analyze() {
    if (busy) return;
    setBusy(true);setError('');
    try {
      const data=await call(`/api/ai/leads/${leadId}/analyze`,{method:'POST',body:'{}'});
      setSuggestion(data.suggestion);setDraft(data.suggestion.result.lineReplyDraft);
    } catch(error) {setError(error instanceof Error?error.message:'วิเคราะห์ไม่สำเร็จ กรุณาลองใหม่');}
    finally {setBusy(false);}
  }
  const analysis=suggestion?.result;
  return <div className="drawerBlock aiBlock">
    <div className="sectionHead"><div><h3>AI Copilot</h3><p>คำแนะนำต้องผ่านการตรวจและอนุมัติ</p>
      {config&&<small>{config.provider==='openai'?`OpenAI · ${config.model}${config.configured?'':' · ยังไม่พร้อมใช้งาน'}`:'โหมดสาธิต · ผลสำรอง ไม่ได้เรียก OpenAI'}</small>}
    </div><button className="softButton" disabled={busy} onClick={analyze}>{busy?'กำลังวิเคราะห์…':'✨ Analyze'}</button></div>
    {error&&<div className="error" role="alert">{error}</div>}
    {analysis&&suggestion&&<div className="analysis" aria-live="polite">
      <small>{suggestion.provider==='safe-fallback'?'ผลสำรอง · ไม่ได้เรียก OpenAI':`วิเคราะห์โดย OpenAI · ${suggestion.provider}`} · {new Date(suggestion.created_at).toLocaleString('th-TH')}</small>
      {error&&<small>ด้านล่างเป็นผลครั้งก่อน</small>}
      <div className="score">{analysis.score}<small>/100</small></div><p>{analysis.summary}</p>
      <strong>เหตุผล</strong><ul>{analysis.scoreReasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>
      <strong>ข้อมูลที่ยังขาด</strong><ul>{analysis.missingInformation.map((item,index)=><li key={index}>{item}</li>)}</ul>
      <strong>ขั้นตอนถัดไป</strong><p>{analysis.nextBestAction}</p>
      <label htmlFor="ai-reply-draft">ร่างข้อความ LINE</label><textarea id="ai-reply-draft" value={draft} onChange={e=>setDraft(e.target.value)}/>
      <button className="primary full" disabled={busy||!draft.trim()} onClick={async()=>{
        setBusy(true);setError('');
        try {await createDraft(draft);} catch(error) {setError(error instanceof Error?error.message:'บันทึกร่างไม่สำเร็จ');}
        finally {setBusy(false);}
      }}>บันทึกเป็น LINE draft</button><small>ตรวจและอนุมัติร่างก่อนส่งข้อความ</small>
    </div>}
  </div>;
}
