'use client';
import { useEffect, useState } from 'react';

type Analysis = {summary:string;score:number;scoreReasons:string[];missingInformation:string[];nextBestAction:string;lineReplyDraft:string;inputSources?:{messages:number;activities:number;additionalNote:boolean;files:{name:string;kind:string;rowCount:number;sheets:string[]}[]}};
type Suggestion = {id:string;provider:string;created_at:string;result:Analysis};
type Props = {leadId:string;initialSuggestion?:Suggestion;call:(path:string,options?:RequestInit)=>Promise<any>;createDraft:(text:string)=>Promise<void>};

export default function LeadAnalysis({leadId,initialSuggestion,call,createDraft}:Props) {
  const [suggestion,setSuggestion]=useState(initialSuggestion);
  const [draft,setDraft]=useState(initialSuggestion?.result.lineReplyDraft || '');
  const [config,setConfig]=useState<{provider:string;model:string;configured:boolean}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [files,setFiles]=useState<File[]>([]);
  const [note,setNote]=useState('');
  function addFiles(event:React.ChangeEvent<HTMLInputElement>) {
    const incoming=Array.from(event.target.files||[]);event.target.value='';
    const combined=[...files];
    for(const file of incoming)if(!combined.some(existing=>existing.name===file.name&&existing.size===file.size&&existing.lastModified===file.lastModified))combined.push(file);
    if(combined.some(file=>! /\.(xlsx|csv|txt|md)$/i.test(file.name))){setError('รองรับ Excel .xlsx, CSV และโน้ต .txt/.md เท่านั้น');return;}
    if(combined.length>3||combined.reduce((sum,file)=>sum+file.size,0)>3*1024*1024){setError('แนบได้ไม่เกิน 3 ไฟล์ รวมขนาดไม่เกิน 3 MB');return;}
    setFiles(combined);setError('');
  }
  useEffect(()=>{
    const controller=new AbortController();
    call('/api/ai/config',{signal:controller.signal}).then(setConfig).catch(()=>{});
    return ()=>controller.abort();
  },[call]);
  async function analyze() {
    if (busy) return;
    setBusy(true);setError('');
    try {
      const body=new FormData();files.forEach(file=>body.append('files',file));body.append('note',note);
      const data=await call(`/api/ai/leads/${leadId}/analyze`,{method:'POST',body});
      setSuggestion(data.suggestion);setDraft(data.suggestion.result.lineReplyDraft);
    } catch(error) {setError(error instanceof Error?error.message:'วิเคราะห์ไม่สำเร็จ กรุณาลองใหม่');}
    finally {setBusy(false);}
  }
  const analysis=suggestion?.result;
  return <div className="drawerBlock aiBlock">
    <div className="sectionHead"><div><h3>AI Copilot</h3><p>คำแนะนำต้องผ่านการตรวจและอนุมัติ</p>
      {config&&<small>{config.provider==='openai'?`OpenAI · ${config.model}${config.configured?'':' · ยังไม่พร้อมใช้งาน'}`:'โหมดสาธิต · ผลสำรอง ไม่ได้เรียก OpenAI'}</small>}
    </div></div>
    <div className="analysisInputs">
      <label htmlFor="analysis-files">เพิ่มไฟล์ประกอบการวิเคราะห์ <span className="muted">(ไม่บังคับ)</span></label>
      <input id="analysis-files" type="file" accept=".xlsx,.csv,.txt,.md" multiple disabled={busy} onChange={addFiles} aria-describedby="analysis-files-hint"/>
      <p id="analysis-files-hint" className="analysisHint">Excel .xlsx, CSV, TXT หรือ MD · สูงสุด 3 ไฟล์ รวม 3 MB · อ่านทุกชีตที่มีข้อมูล</p>
      {files.length>0&&<ul className="analysisFileList">{files.map((file,index)=><li key={`${file.name}-${file.lastModified}`}><span><strong>{file.name}</strong><small>{(file.size/1024).toFixed(1)} KB</small></span><button type="button" className="softButton" aria-label={`นำไฟล์ ${file.name} ออก`} disabled={busy} onClick={()=>setFiles(previous=>previous.filter((_,i)=>i!==index))}>×</button></li>)}</ul>}
      <label htmlFor="analysis-note">โน้ตเพิ่มเติม <span className="muted">(ไม่บังคับ)</span></label>
      <textarea id="analysis-note" placeholder="วางโน้ตการคุยหรือข้อมูลเพิ่มเติมของ Lead นี้…" value={note} maxLength={20000} disabled={busy} onChange={event=>setNote(event.target.value)}/>
      <p className="analysisHint">AI จะใช้ข้อมูล Lead, Conversation และ Activity timeline ทั้งหมดที่คุณมีสิทธิ์ดู ร่วมกับไฟล์และโน้ตที่แนบ</p>
      <button type="button" className="primary full" disabled={busy} onClick={analyze}>{busy?'กำลังอ่านข้อมูลและวิเคราะห์…':`✨ Analyze${files.length?' พร้อมไฟล์ '+files.length+' ไฟล์':''}`}</button>
      <p className="analysisHint">ไฟล์ใช้สำหรับการวิเคราะห์ครั้งนี้ ผลวิเคราะห์และรายชื่อไฟล์จะบันทึกกับ Lead</p>
    </div>
    {error&&<div className="error" role="alert">{error}</div>}
    {analysis&&suggestion&&<div className="analysis" aria-live="polite">
      <small>{suggestion.provider==='safe-fallback'?'ผลสำรอง · ไม่ได้เรียก OpenAI':`วิเคราะห์โดย OpenAI · ${suggestion.provider}`} · {new Date(suggestion.created_at).toLocaleString('th-TH')}</small>
      {analysis.inputSources&&<details className="analysisSources"><summary>ข้อมูลที่ใช้: {analysis.inputSources.messages} ข้อความ · {analysis.inputSources.activities} กิจกรรม · {analysis.inputSources.files.length} ไฟล์{analysis.inputSources.additionalNote?' · โน้ตเพิ่มเติม':''}</summary><ul>{analysis.inputSources.files.map((file,index)=><li key={index}><strong>{file.name}</strong> · {file.rowCount} แถว/บรรทัด{file.sheets.length?' · ชีต: '+file.sheets.join(', '):''}</li>)}</ul></details>}
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
