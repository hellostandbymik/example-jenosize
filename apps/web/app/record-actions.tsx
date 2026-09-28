'use client';
import { useEffect, useRef, useState } from 'react';

type Entity='companies'|'contacts'|'leads';
type Call=(path:string,options?:RequestInit)=>Promise<any>;
type Props={entity:Entity;record:any;call:Call;onChanged:(deleted:boolean)=>Promise<void>|void};
type Field={key:string;label:string;type?:string;required?:boolean;min?:number;max?:number;step?:string};
const fields:Record<Entity,Field[]>={
  companies:[{key:'name',label:'ชื่อบริษัท',required:true},{key:'website',label:'เว็บไซต์',type:'url'},{key:'industry',label:'อุตสาหกรรม'},{key:'phone',label:'โทรศัพท์',type:'tel'},{key:'notes',label:'รายละเอียดบริษัท',type:'textarea'}],
  contacts:[{key:'firstName',label:'ชื่อ Contact',required:true},{key:'lastName',label:'นามสกุล'},{key:'email',label:'อีเมล',type:'email'},{key:'phone',label:'โทรศัพท์',type:'tel'},{key:'companyId',label:'บริษัท',type:'company'},{key:'title',label:'ตำแหน่ง'}],
  leads:[{key:'title',label:'ชื่อ Lead',required:true},{key:'companyId',label:'บริษัท',type:'company'},{key:'contactId',label:'ผู้ติดต่อ',type:'contact'},{key:'stage',label:'สถานะการขาย',type:'stage'},{key:'source',label:'ที่มาของ Lead',required:true},{key:'value',label:'มูลค่าโอกาสขาย (บาท)',type:'number',min:0,max:999999999999.99,step:'0.01'},{key:'probability',label:'โอกาสปิดการขาย (%)',type:'number',min:0,max:100,step:'1'},{key:'nextFollowUp',label:'วันและเวลาติดตามครั้งถัดไป',type:'datetime-local'},{key:'lossReason',label:'เหตุผลที่ขายไม่สำเร็จ',type:'textarea'}]
};
const databaseKeys:Record<string,string>={firstName:'first_name',lastName:'last_name',companyId:'company_id',contactId:'contact_id',nextFollowUp:'next_follow_up',lossReason:'loss_reason'};
const entityLabel:Record<Entity,string>={companies:'Company',contacts:'Contact',leads:'Lead'};
function localDate(value:string) {
  const date=new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad=(n:number)=>String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function initialValues(entity:Entity,record:any) {
  return Object.fromEntries(fields[entity].map(field=>{
    const value=record[databaseKeys[field.key]||field.key];
    return [field.key,field.type==='datetime-local'&&value?localDate(value):String(value??'')];
  }));
}
function RecordDialog({entity,record,call,onChanged,mode,close}:Props&{mode:'edit'|'delete';close:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [values,setValues]=useState(()=>initialValues(entity,record));
  const [companies,setCompanies]=useState<any[]>([]);
  const [contacts,setContacts]=useState<any[]>([]);
  const [impact,setImpact]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [loadFailed,setLoadFailed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const name=entity==='contacts'?[record.first_name,record.last_name].filter(Boolean).join(' '):entity==='leads'?record.title:record.name;
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{
    let active=true;
    async function load() {
      try {
        if (mode==='delete') {
          const data=await call(`/api/${entity}/${record.id}/delete-impact`);
          if(active)setImpact(data);
        } else if(entity!=='companies') {
          const [companyData,firstContacts]=await Promise.all([call('/api/companies'),entity==='leads'?call('/api/contacts?page=1'):Promise.resolve(null)]);
          let allContacts=firstContacts?.items||[];
          if(firstContacts?.totalPages>1) {
            const pages=await Promise.all(Array.from({length:firstContacts.totalPages-1},(_,i)=>call(`/api/contacts?page=${i+2}`)));
            allContacts=allContacts.concat(pages.flatMap(page=>page.items));
          }
          if(active){setCompanies(companyData.items);setContacts(allContacts);}
        }
      } catch(error) {if(active){setLoadFailed(true);setError(error instanceof Error?error.message:'โหลดข้อมูลไม่สำเร็จ');}}
      finally {if(active)setLoading(false);}
    }
    void load();return()=>{active=false;};
  },[call,entity,record.id,mode]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();if(busy||loading)return;
    setBusy(true);setError('');
    try {
      if(mode==='delete') await call(`/api/${entity}/${record.id}`,{method:'DELETE',body:JSON.stringify({confirmName:impact.name,expectedImpact:impact.impact})});
      else {
        const body:Record<string,unknown>={};
        for(const field of fields[entity]) {
          const value=values[field.key].trim();
          body[field.key]=field.type==='number'?(value?Number(value):null):field.type==='datetime-local'?(value?new Date(value).toISOString():null):value||null;
        }
        if(entity==='leads' && body.stage!=='Lost')body.lossReason=null;
        await call(`/api/${entity}/${record.id}`,{method:'PATCH',body:JSON.stringify(body)});
      }
      await onChanged(mode==='delete');close();
    } catch(error){setError(error instanceof Error?error.message:'ดำเนินการไม่สำเร็จ');}
    finally{setBusy(false);}
  }
  const canSave=!loading&&!busy&&!loadFailed&&(mode==='edit'||Boolean(impact));
  return <dialog ref={dialog} className="recordDialog" aria-labelledby="record-dialog-title" onCancel={event=>{event.preventDefault();if(!busy)close();}}>
    <form onSubmit={submit}>
      <div className="recordDialogHead"><h3 id="record-dialog-title">{mode==='edit'?'แก้ไข':'ลบ'} {entityLabel[entity]}</h3><button type="button" className="close" aria-label="ปิดหน้าต่าง" disabled={busy} onClick={close}>×</button></div>
      <p className="muted">{name}</p>
      {loading&&<p role="status">กำลังโหลดข้อมูล…</p>}{error&&<p className="error" role="alert">{error}</p>}
      {mode==='edit'?<div className="recordFields">{fields[entity].filter(field=>field.key!=='lossReason'||values.stage==='Lost').map((field,index)=>{
        const id=`record-field-${field.key}`;
        const choices=field.type==='company'?companies:contacts;
        return <label key={field.key} htmlFor={id}>{field.label}
          {field.type==='textarea'?<textarea id={id} value={values[field.key]} disabled={busy} onChange={event=>setValues({...values,[field.key]:event.target.value})}/>
          :['company','contact','stage'].includes(field.type||'')?<select id={id} value={values[field.key]} disabled={busy||loading} onChange={event=>setValues({...values,[field.key]:event.target.value})}>
            {field.type==='stage'?['New','Qualified','Proposal','Won','Lost'].map(stage=><option key={stage}>{stage}</option>):<><option value="">ไม่ระบุ{field.type==='company'?'บริษัท':'ผู้ติดต่อ'}</option>{choices.map(item=><option key={item.id} value={item.id}>{field.type==='company'?item.name:[item.first_name,item.last_name].filter(Boolean).join(' ')}</option>)}{values[field.key]&&!choices.some(item=>item.id===values[field.key])&&<option value={values[field.key]}>รายการที่เลือกไว้เดิม</option>}</>}
          </select>:<input id={id} autoFocus={index===0} type={field.type||'text'} required={field.required} min={field.min} max={field.max} step={field.step} value={values[field.key]} disabled={busy} onChange={event=>setValues({...values,[field.key]:event.target.value})}/>}
        </label>;
      })}{entity==='contacts'&&record.line_user_id&&<p className="muted">LINE ที่จับคู่ไว้จะใช้กับ Contact นี้ต่อหลังแก้ไข</p>}</div>
      :impact&&<div className="deleteImpact">
        <p><strong>ยืนยันลบ “{impact.name}”?</strong> การลบนี้กู้คืนผ่านหน้าเว็บไม่ได้</p>
        {entity==='companies'&&<p>Contacts {impact.impact.contacts} ราย และ Leads {impact.impact.leads} รายจะยังอยู่ แต่ไม่ผูกกับบริษัทนี้</p>}
        {entity==='contacts'&&<><p>Leads {impact.impact.leads} ราย และข้อความ {impact.impact.messages} รายการจะยังอยู่ แต่ไม่ผูกกับ Contact นี้</p>{impact.impact.lineLinked&&<p>ผู้ส่ง LINE นี้จะกลับไปอยู่ใน Unmapped เพื่อจับคู่ใหม่ได้</p>}</>}
        {entity==='leads'&&<><p>โน้ตกิจกรรม {impact.impact.activities} รายการและผล AI {impact.impact.suggestions} รายการของ Lead นี้จะถูกลบด้วย</p><p>ข้อความ {impact.impact.messages} รายการจะยังอยู่ แต่ไม่ผูกกับ Lead นี้ บริษัทและ Contact จะยังอยู่</p></>}
      </div>}
      <div className="recordDialogFooter"><button type="button" className="softButton" disabled={busy} onClick={close}>ยกเลิก</button><button className={mode==='delete'?'dangerButton':'primary'} disabled={!canSave}>{busy?'กำลังบันทึก…':mode==='delete'?'ยืนยันลบ':'บันทึกการแก้ไข'}</button></div>
    </form>
  </dialog>;
}
export default function RecordActions(props:Props) {
  const [mode,setMode]=useState<'edit'|'delete'|null>(null);
  return <><div className="recordActions"><button className="softButton" onClick={()=>setMode('edit')}>แก้ไข</button><button className="dangerButton" onClick={()=>setMode('delete')}>ลบ</button></div>
    {mode&&<RecordDialog key={`${props.entity}:${props.record.id}:${mode}`} {...props} mode={mode} close={()=>setMode(null)}/>}</>;
}
