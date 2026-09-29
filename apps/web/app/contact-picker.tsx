'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

type Contact = { id:string; first_name?:string; last_name?:string; email?:string; phone?:string; company_id?:string|null };
type Company = { id:string; name:string };
type Props = { id?:string; label:string; contacts:Contact[]; companies:Company[]; companyId:string; value:string; onChange:(value:string)=>void; disabled?:boolean; loading?:boolean };
const nameOf = (contact:Contact) => [contact.first_name,contact.last_name].filter(Boolean).join(' ') || contact.email || 'ผู้ติดต่อ';
const normalize = (value:string) => value.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g,' ');

export default function ContactPicker({id,label,contacts,companies,companyId,value,onChange,disabled,loading}:Props) {
  const generatedId=useId();
  const inputId=id||`contact-${generatedId}`;
  const listId=`${inputId}-options`;
  const input=useRef<HTMLInputElement>(null);
  const list=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [active,setActive]=useState(0);
  const companyNames=useMemo(()=>new Map(companies.map(company=>[company.id,company.name])),[companies]);
  const selected=contacts.find(contact=>contact.id===value);
  const selectedName=selected?nameOf(selected):value?'ผู้ติดต่อที่เลือกไว้':'';
  const matches=useMemo(()=>{
    const terms=normalize(query).split(' ').filter(Boolean);
    return contacts.filter(contact=>{
      if(companyId&&contact.company_id!==companyId)return false;
      const text=normalize([nameOf(contact),contact.email,contact.phone,companyNames.get(contact.company_id||'')].filter(Boolean).join(' '));
      return terms.every(term=>text.includes(term));
    });
  },[contacts,companyId,query,companyNames]);
  const options:Array<Contact|null>=query.trim()?matches.slice(0,50):[null,...matches.slice(0,50)];
  const expanded=open&&!disabled;
  const activeIndex=Math.min(active,Math.max(0,options.length-1));
  useEffect(()=>{
    if(!expanded||!list.current)return;
    const option=list.current.children[activeIndex] as HTMLElement|undefined;
    if(option) {
      const bottom=option.offsetTop+option.offsetHeight;
      if(option.offsetTop<list.current.scrollTop)list.current.scrollTop=option.offsetTop;
      else if(bottom>list.current.scrollTop+list.current.clientHeight)list.current.scrollTop=bottom-list.current.clientHeight;
    }
  },[activeIndex,expanded,query]);
  function show() {setQuery('');setActive(0);setOpen(true);}
  function choose(contact:Contact|null) {input.current?.focus();onChange(contact?.id||'');setOpen(false);setQuery('');}

  return <div className="contactPicker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <div className="contactPickerControl">
      <input ref={input} id={inputId} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
        aria-activedescendant={expanded&&options.length?`${listId}-${activeIndex}`:undefined} autoComplete="off" disabled={disabled}
        placeholder={loading?'กำลังโหลดผู้ติดต่อ…':expanded?'ค้นหาชื่อ อีเมล หรือเบอร์โทร…':'ไม่ระบุผู้ติดต่อ'} value={expanded?query:selectedName}
        onFocus={show} onClick={()=>{if(!open)show();}} onChange={event=>{setQuery(event.target.value);setActive(0);setOpen(true);}}
        onKeyDown={event=>{
          if(event.nativeEvent.isComposing)return;
          if(event.key==='ArrowDown'||event.key==='ArrowUp') {
            event.preventDefault();
            if(!expanded)show();
            else setActive(index=>Math.max(0,Math.min(options.length-1,index+(event.key==='ArrowDown'?1:-1))));
          } else if(event.key==='Enter'&&expanded) {
            event.preventDefault();if(options.length)choose(options[activeIndex]);
          } else if(event.key==='Escape'&&expanded) {
            event.preventDefault();event.stopPropagation();setOpen(false);
          } else if(event.key==='Tab')setOpen(false);
        }}/>
      {value&&<button type="button" className="contactPickerClear" aria-label="ล้างผู้ติดต่อที่เลือก" disabled={disabled}
        onMouseDown={event=>event.preventDefault()} onClick={()=>{onChange('');setQuery('');setOpen(false);}}>×</button>}
      <button type="button" className="contactPickerToggle" aria-label={expanded?'ปิดรายชื่อผู้ติดต่อ':'เปิดรายชื่อผู้ติดต่อ'} disabled={disabled}
        onMouseDown={event=>event.preventDefault()} onClick={()=>{if(expanded)setOpen(false);else {input.current?.focus();show();}}}>⌄</button>
    </div>
    {expanded&&<div className="contactPickerPopup">
      <div className="contactPickerHint" role="status">{loading?'กำลังโหลดผู้ติดต่อ…':<>{companyId?'ผู้ติดต่อในบริษัทที่เลือก':'ผู้ติดต่อทุกบริษัท'} · {matches.length.toLocaleString()} คน{value&&query?' · รายการเดิมยังเลือกอยู่':''}</>}</div>
      <div ref={list} id={listId} role="listbox" aria-label="ผลค้นหาผู้ติดต่อ" className="contactPickerList">
        {options.map((contact,index)=><button type="button" role="option" tabIndex={-1} id={`${listId}-${index}`} key={contact?.id||'none'}
          aria-selected={contact?contact.id===value:!value} className={`contactPickerOption${index===activeIndex?' active':''}`}
          onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(contact)}>
          <strong>{contact?nameOf(contact):'ไม่ระบุผู้ติดต่อ'}{contact?.id===value?' ✓':''}</strong>
          {contact&&<small>{[contact.email,contact.phone,companyNames.get(contact.company_id||'')].filter(Boolean).join(' · ')||'ไม่มีข้อมูลติดต่อเพิ่มเติม'}</small>}
        </button>)}
        {!loading&&!matches.length&&<p className="contactPickerEmpty">{query.trim()?'ไม่พบผู้ติดต่อที่ตรงกับคำค้น':'ยังไม่มีผู้ติดต่อในบริษัทนี้'}</p>}
      </div>
      {matches.length>50&&<div className="contactPickerHint">แสดง 50 คนแรก · พิมพ์เพิ่มเพื่อค้นหาให้เจาะจงขึ้น</div>}
    </div>}
  </div>;
}
