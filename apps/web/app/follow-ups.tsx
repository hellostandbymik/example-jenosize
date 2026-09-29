'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import ListPagination from './list-pagination';
import FollowUpSchedule, { type APICall } from './follow-up-schedule';
import { formatDay, formatTime, matchesFilter, monthDays, shiftMonth, thaiDate, type FollowUpFilter, type FollowUpLead } from './follow-up-utils';

type Props = { items: FollowUpLead[]; loading: boolean; error: string; superAdmin: boolean; call: APICall; openLead: (id: string) => void; reload: () => void; onChanged: () => Promise<void> };
const filters: { key: FollowUpFilter; label: string; note: string }[] = [
  { key: 'overdue', label: 'เกินกำหนด', note: 'เลยเวลานัดแล้ว' },
  { key: 'today', label: 'วันนี้', note: 'ทุกนัดในวันนี้' },
  { key: 'week', label: '7 วันข้างหน้า', note: 'รวมวันนี้' },
  { key: 'unscheduled', label: 'ยังไม่ได้นัด', note: 'Lead ที่ยังเปิดอยู่' }
];
const contactName = (lead: FollowUpLead) => [lead.contact_first, lead.contact_last].filter(Boolean).join(' ') || 'ไม่ระบุผู้ติดต่อ';

export default function FollowUps({ items, loading, error, superAdmin, call, openLead, reload, onChanged }: Props) {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [filter, setFilter] = useState<FollowUpFilter>('all');
  const [search, setSearch] = useState(''), [owner, setOwner] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const today = thaiDate(now);
  const [month, setMonth] = useState(() => thaiDate().slice(0, 7));
  const [day, setDay] = useState(() => thaiDate());
  const [page, setPage] = useState(1);
  const [agendaPage, setAgendaPage] = useState(1);
  const [editing, setEditing] = useState<FollowUpLead | null>(null);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (editing) dialog.current?.showModal(); }, [editing]);
  const owners = useMemo(() => [...new Map(items.map(lead => [lead.owner_id, lead.owner])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'th')), [items]);
  const base = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return items.filter(lead => (!owner || lead.owner_id === owner) && (!query || [lead.title, lead.company, contactName(lead), lead.owner].join(' ').toLocaleLowerCase().includes(query)))
      .sort((a, b) => (a.next_follow_up ? new Date(a.next_follow_up).getTime() : Infinity) - (b.next_follow_up ? new Date(b.next_follow_up).getTime() : Infinity) || a.title.localeCompare(b.title, 'th'));
  }, [items, search, owner]);
  const visible = base.filter(lead => matchesFilter(lead, filter, now));
  const pages = Math.max(1, Math.ceil(visible.length / 20)), currentPage = Math.min(page, pages);
  const list = visible.slice((currentPage - 1) * 20, currentPage * 20);
  const byDay = new Map<string, FollowUpLead[]>();
  for (const lead of visible) if (lead.next_follow_up) { const key = thaiDate(lead.next_follow_up); const records = byDay.get(key) || []; records.push(lead); byDay.set(key, records); }
  const agenda = byDay.get(day) || [];
  const currentAgendaPage = Math.min(agendaPage, Math.max(1, Math.ceil(agenda.length / 10)));
  const agendaList = agenda.slice((currentAgendaPage - 1) * 10, currentAgendaPage * 10);
  function selectDay(date: string) { setDay(date); setAgendaPage(1); }
  function chooseFilter(next: FollowUpFilter) {
    setFilter(next); setPage(1); setAgendaPage(1);
    if (next === 'unscheduled') setView('list');
    else if (view === 'calendar' && (next === 'today' || next === 'week')) goToday();
    else if (view === 'calendar' && next === 'overdue') {
      const first = base.find(lead => matchesFilter(lead, 'overdue', now));
      if (first?.next_follow_up) { const date = thaiDate(first.next_follow_up); selectDay(date); setMonth(date.slice(0, 7)); }
    }
  }
  function moveMonth(amount: number) { const next = shiftMonth(month, amount); setMonth(next); selectDay(`${next}-01`); }
  function goToday() { setMonth(today.slice(0, 7)); selectDay(today); }
  function dateStatus(lead: FollowUpLead) {
    if (!lead.next_follow_up) return <span className="followBadge unscheduled">ยังไม่ได้นัด</span>;
    const past = new Date(lead.next_follow_up).getTime() < now;
    return <span className={`followBadge ${past ? 'overdue' : thaiDate(lead.next_follow_up) === today ? 'today' : ''}`}>{past ? 'เกินกำหนด' : thaiDate(lead.next_follow_up) === today ? 'วันนี้' : 'นัดถัดไป'}</span>;
  }
  function renderLead(lead: FollowUpLead, showDate: boolean) {
    return <article className="followItem" key={lead.id}>
      <div className="followTime">{lead.next_follow_up ? <><strong>{formatTime(lead.next_follow_up)}</strong>{showDate && <small>{formatDay(thaiDate(lead.next_follow_up))}</small>}</> : <strong>รอนัดหมาย</strong>}{dateStatus(lead)}</div>
      <div className="followIdentity"><button type="button" className="followLeadTitle" onClick={() => openLead(lead.id)}>{lead.title}</button><p>{lead.company || 'ไม่ระบุบริษัท'} · {contactName(lead)}</p><div><span className={`badge ${lead.stage.toLowerCase()}`}>{lead.stage}</span>{superAdmin && <small>ผู้รับผิดชอบ: {lead.owner}</small>}</div></div>
      <div className="followActions"><button className="softButton" onClick={() => { setMessage(''); setEditing(lead); }} aria-label={`นัดติดตาม ${lead.title}`}>{lead.next_follow_up ? 'เปลี่ยนนัด' : 'นัดติดตาม'}</button><button className="primary" onClick={() => openLead(lead.id)} aria-label={`เปิด Lead ${lead.title}`}>เปิด Lead ↗</button></div>
    </article>;
  }
  return <div className="followWorkspace">
    <div className="followIntro"><div><h3>ไม่พลาดการติดตามลูกค้า</h3><p>{superAdmin ? 'นัดติดตามของทีมทั้งหมด' : 'นัดติดตามของ Lead ที่คุณรับผิดชอบ'} · เวลาไทย (GMT+7) · แสดงเฉพาะ Lead ที่ยังเปิดอยู่</p></div><button className="softButton" onClick={reload} disabled={loading}>{loading ? 'กำลังโหลด…' : '↻ รีเฟรช'}</button></div>
    {error && <div className="error" role="alert">{error} <button onClick={reload}>ลองอีกครั้ง</button></div>}
    <div className="followSummary" role="group" aria-label="เลือกช่วงเวลาติดตาม">{filters.map(item => <button key={item.key} type="button" className={`followMetric ${filter === item.key ? 'selected' : ''} ${item.key}`} aria-pressed={filter === item.key} onClick={() => chooseFilter(item.key)}><span>{item.label}</span><strong>{loading ? '…' : base.filter(lead => matchesFilter(lead, item.key, now)).length}</strong><small>{item.note}</small></button>)}</div>
    <section className="contentCard followContent" aria-busy={loading}>
      <div className="followToolbar"><div className="followView" role="group" aria-label="มุมมอง Follow up"><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>☷ รายการ</button><button type="button" aria-pressed={view === 'calendar'} onClick={() => { if (filter === 'unscheduled') setFilter('all'); setView('calendar'); }}>▦ ปฏิทิน</button></div><div className="followSearch"><input type="search" aria-label="ค้นหานัดติดตาม" placeholder="ค้นหา Lead บริษัท หรือผู้ติดต่อ…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setAgendaPage(1); }}/>{superAdmin && <select aria-label="กรองผู้รับผิดชอบนัดติดตาม" value={owner} onChange={event => { setOwner(event.target.value); setPage(1); setAgendaPage(1); }}><option value="">ทุกสมาชิก</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}</div></div>
      <div className="followContext"><button type="button" className={filter === 'all' ? 'softButton' : 'followReset'} aria-pressed={filter === 'all'} onClick={() => chooseFilter('all')}>นัดทั้งหมด</button><span>{filter === 'all' ? 'เรียงตามวันนัด · งานเกินกำหนดอยู่ด้านบน' : filters.find(item => item.key === filter)?.label} · {loading ? 'กำลังโหลด…' : `${visible.length} รายการ`}</span>{(search || owner) && <button className="followReset" onClick={() => { setSearch(''); setOwner(''); setPage(1); setAgendaPage(1); }}>ล้างการค้นหา</button>}</div>
      {message && <p className="followSuccess" role="status">{message}</p>}
      {loading ? <p className="followEmpty" role="status">กำลังโหลดนัดติดตาม…</p> : error ? <p className="followEmpty">โหลดรายการไม่สำเร็จ กรุณาลองอีกครั้ง</p> : view === 'list' ? <>
        {!list.length && <div className="followEmpty"><strong>{filter === 'overdue' ? 'ไม่มีงานเกินกำหนด' : filter === 'unscheduled' ? 'ทุก Lead มีวันนัดแล้ว' : 'ไม่มีนัดที่ตรงกับตัวกรอง'}</strong><p>ลองเลือกนัดทั้งหมด หรือเปลี่ยนคำค้นและผู้รับผิดชอบ</p></div>}
        <div className="followList">{list.map(lead => renderLead(lead, true))}</div><ListPagination total={visible.length} page={currentPage} pageSize={20} change={setPage} label="Follow up"/>
      </> : <div className="followCalendarLayout">
        <div className="followCalendar"><div className="followMonthBar"><button className="softButton" aria-label="เดือนก่อนหน้า" onClick={() => moveMonth(-1)}>‹</button><h4 aria-live="polite">{new Date(`${month}-01T00:00:00+07:00`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', month: 'long', year: 'numeric' })}</h4><button className="softButton" aria-label="เดือนถัดไป" onClick={() => moveMonth(1)}>›</button></div>
          <div className="followDateJump"><button className="softButton" onClick={goToday}>วันนี้</button><label>ไปวันที่ <input type="date" aria-label="เลือกวันที่ในปฏิทิน" value={day} onChange={event => { if (event.target.value) { selectDay(event.target.value); setMonth(event.target.value.slice(0, 7)); } }}/></label></div>
          <div className="followCalendarGrid" role="group" aria-label="เลือกวันดูนัดติดตาม">{['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map(name => <span className="followWeekday" key={name}>{name}</span>)}{monthDays(month).map(date => { const events = byDay.get(date) || [], overdue = events.some(lead => new Date(lead.next_follow_up!).getTime() < now); return <button type="button" key={date} className={`followDay ${date.slice(0, 7) !== month ? 'outside' : ''} ${date === today ? 'isToday' : ''} ${overdue ? 'hasOverdue' : ''}`} aria-pressed={day === date} aria-current={date === today ? 'date' : undefined} aria-label={`${formatDay(date)}${date === today ? ' วันนี้' : ''}, ${events.length} นัด${overdue ? ', มีงานเกินกำหนด' : ''}`} onClick={() => { selectDay(date); if (date.slice(0, 7) !== month) setMonth(date.slice(0, 7)); }}><span>{Number(date.slice(-2))}</span>{events.length > 0 && <small>{events.length}<span> นัด</span></small>}</button>; })}</div>
          <p className="followLegend"><span className="followLegendDot"/> มีนัดติดตาม <span className="followLegendDot overdue"/> มีงานเกินกำหนด</p>
        </div><section className="followAgenda" aria-label="นัดติดตามวันที่เลือก"><div className="followAgendaHead"><h4>{formatDay(day)}{day === today ? ' · วันนี้' : ''}</h4><span>{agenda.length} นัด</span></div><ListPagination total={agenda.length} page={currentAgendaPage} pageSize={10} change={setAgendaPage} label="นัดประจำวัน"/><div className="followList">{agenda.length ? agendaList.map(lead => renderLead(lead, false)) : <div className="followEmpty"><strong>ไม่มีนัดติดตามในวันนี้</strong><p>เลือกวันที่มีจำนวนบนปฏิทินเพื่อดูนัด</p></div>}</div><ListPagination total={agenda.length} page={currentAgendaPage} pageSize={10} change={setAgendaPage} label="นัดประจำวัน"/></section>
      </div>}
    </section>
    {editing && <dialog ref={dialog} className="recordDialog" aria-labelledby="follow-schedule-title" onCancel={() => setEditing(null)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setEditing(null); } }}><div className="recordDialogHead"><h3 id="follow-schedule-title">นัดติดตามครั้งถัดไป</h3><button className="softButton" aria-label="ปิดนัดติดตาม" onClick={() => setEditing(null)}>×</button></div><p>{editing.title}</p><FollowUpSchedule key={`${editing.id}-${editing.next_follow_up}`} id={editing.id} due={editing.next_follow_up} call={call} onSaved={async () => { setEditing(null); setMessage('บันทึกวันนัดติดตามแล้ว'); await onChanged(); }}/></dialog>}
  </div>;
}
