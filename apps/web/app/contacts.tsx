'use client';

import { useEffect, useState } from 'react';
import RecordActions from './record-actions';

type Call = (path: string, options?: RequestInit) => Promise<any>;
type Contact = { id: string; first_name: string; last_name: string | null; email: string | null; company: string | null; line_user_id: string | null };
type Sender = { line_user_id: string; processed_at: string; message_count: number; latest_message: string | null; latest_message_type: string | null };
type ChatMessage = { id: string; content: string | null; created_at: string; direction?: string; message_type?: string };
type Profile = { display_name: string | null };
type ContactPage = { counts: Record<string, number>; total: number; page: number; pageSize: number; totalPages: number };

function ContactPagination({ data, loading, change }: { data: ContactPage | null; loading: boolean; change: (page: number) => void }) {
  if (!data) return null;
  const start = data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const end = Math.min(data.page * data.pageSize, data.total);
  return <nav className="contactPagination" aria-label="เปลี่ยนหน้า Contacts">
    <span role="status">{loading ? 'กำลังโหลด Contacts…' : `แสดง ${start.toLocaleString()}–${end.toLocaleString()} จาก ${data.total.toLocaleString()} ราย`}</span>
    <div><button className="softButton" disabled={loading || data.page <= 1} onClick={() => change(data.page - 1)}>ก่อนหน้า</button>
      <select aria-label="หน้า Contacts" value={data.page} disabled={loading} onChange={e => change(Number(e.target.value))}>
        {Array.from({ length: data.totalPages }, (_, i) => <option key={i + 1} value={i + 1}>หน้า {i + 1} / {data.totalPages}</option>)}
      </select><button className="softButton" disabled={loading || data.page >= data.totalPages} onClick={() => change(data.page + 1)}>ถัดไป</button></div>
  </nav>;
}

function messageText(content: string | null, type?: string | null) {
  if (content !== null) return content;
  const labels: Record<string, string> = { image: 'รูปภาพ', video: 'วิดีโอ', audio: 'เสียง', sticker: 'สติกเกอร์', file: 'ไฟล์', location: 'ตำแหน่งที่ตั้ง' };
  return type ? `[${labels[type] || type}]` : 'ยังไม่มีข้อความ';
}

function Conversation({ messages }: { messages: ChatMessage[] }) {
  return <div className="contactConversation">{messages.map(m => <div className={`chatMessage ${m.direction === 'outbound' ? 'outbound' : ''}`} key={m.id}>
    <small>{m.direction === 'outbound' ? 'ทีมส่งข้อความ' : 'ผู้ส่ง LINE'}</small>
    <p>{messageText(m.content, m.message_type)}</p>
    <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString('th-TH')}</time>
  </div>)}{!messages.length && <p className="muted">ยังไม่มีข้อความสนทนา</p>}</div>;
}

function SenderCard({ sender, name, contacts, link, open }: {
  sender: Sender; name: string; contacts: Contact[];
  link: (userId: string, contactId: string) => Promise<void>; open: () => void;
}) {
  const [contactId, setContactId] = useState('');
  const [saving, setSaving] = useState(false);
  async function match() {
    setSaving(true);
    try { await link(sender.line_user_id, contactId); } finally { setSaving(false); }
  }
  return <article className="lineSenderCard">
    <div className="lineSenderHeader"><div className="lineSenderAvatar" aria-hidden="true">{name === 'กำลังโหลดชื่อ LINE…' ? '…' : name.charAt(0)}</div>
      <div className="lineSenderIdentity"><h4>{name}</h4><code>{sender.line_user_id}</code></div>
      <span className="badge">{sender.message_count} ข้อความ</span>
    </div>
    <p className="lineMessagePreview">{messageText(sender.latest_message, sender.latest_message_type)}</p>
    <p className="lineSenderTime">ล่าสุด {new Date(sender.processed_at).toLocaleString('th-TH')}</p>
    <div className="lineSenderActions"><button className="softButton" onClick={open}>ดูข้อความ ({sender.message_count})</button>
      <select aria-label={`เลือก Contact สำหรับ ${name}`} value={contactId} onChange={e => setContactId(e.target.value)}>
        <option value="">เลือก Contact</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} · {c.email || c.company || 'ไม่ระบุบริษัท'}</option>)}
      </select><button className="primary" disabled={!contactId || saving} onClick={match}>{saving ? 'กำลังจับคู่…' : 'จับคู่'}</button>
    </div>
  </article>;
}

function SenderConversation({ sender, name, call, close }: { sender: Sender; name: string; call: Call; close: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const path = `/api/contacts/unmapped/${encodeURIComponent(sender.line_user_id)}/messages`;
  useEffect(() => {
    let active = true;
    call(path).then(data => { if (active) { setMessages([...data.items].reverse()); setCursor(data.nextCursor); } })
      .catch((e: Error) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [call, path]);
  async function older() {
    if (!cursor || loading) return;
    setLoading(true); setError('');
    try {
      const data = await call(`${path}?before=${encodeURIComponent(cursor)}`);
      setMessages(current => [...data.items].reverse().concat(current)); setCursor(data.nextCursor);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  return <div className="drawerBackdrop" onClick={close}><aside className="drawer" role="dialog" aria-modal="true" aria-label={`บทสนทนา ${name}`} onClick={e => e.stopPropagation()}>
    <button className="close" aria-label="ปิดบทสนทนา" onClick={close}>×</button><div className="eyebrow">LINE CONVERSATION</div>
    <h2>{name}</h2><code className="lineUserId">{sender.line_user_id}</code><p className="muted">รวม {sender.message_count} ข้อความจากผู้ส่งคนนี้</p>
    {error && <p className="error" role="alert">{error}</p>}
    {cursor && <button className="softButton full" disabled={loading} onClick={older}>โหลดข้อความก่อนหน้า</button>}
    {loading && <p className="muted" role="status">กำลังโหลดข้อความ…</p>}
    <Conversation messages={messages} />
  </aside></div>;
}

export default function Contacts({ call, openLead, onRecordsChanged }: { call: Call; openLead: (id: string) => void; onRecordsChanged?:()=>Promise<void> }) {
  const [items, setItems] = useState<Contact[]>([]);
  const [linkOptions, setLinkOptions] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [unknown, setUnknown] = useState<Sender[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [lineFilter, setLineFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<ContactPage | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [first, setFirst] = useState(''); const [last, setLast] = useState(''); const [email, setEmail] = useState(''); const [companyId, setCompanyId] = useState('');
  const [message, setMessage] = useState(''); const [selected, setSelected] = useState<any>(null); const [selectedSender, setSelectedSender] = useState<Sender | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(''); setItems([]);
    call(`/api/contacts?line=${lineFilter}&page=${page}`).then(data => { if (active) { setItems(data.items); setPageData(data); setPage(data.page); } })
      .catch((e: Error) => { if (active) setLoadError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [call, lineFilter, page, reload]);
  useEffect(() => {
    let active = true;
    Promise.all([call('/api/contacts?line=unlinked'), call('/api/contacts/unmapped'), call('/api/companies')])
      .then(([contacts, senders, companies]) => { if (active) { setLinkOptions(contacts.items); setUnknown(senders.items); setCompanies(companies.items); } })
      .catch((e: Error) => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [call, reload]);
  useEffect(() => {
    let active = true; let next = 0;
    // Names load separately so a slow LINE API never hides contacts or messages.
    async function worker() {
      while (active && next < unknown.length) {
        const userId = unknown[next++].line_user_id;
        const profile = await call(`/api/contacts/line/${encodeURIComponent(userId)}/profile`).catch(() => ({ display_name: null }));
        if (active) setProfiles(current => ({ ...current, [userId]: profile }));
      }
    }
    for (let i = 0; i < Math.min(4, unknown.length); i++) void worker();
    return () => { active = false; };
  }, [call, unknown]);
  const senderName = (userId: string) => profiles[userId]?.display_name || (profiles[userId] ? 'ไม่พบชื่อโปรไฟล์ LINE' : 'กำลังโหลดชื่อ LINE…');

  async function openContact(id: string) {
    try { setSelected(await call(`/api/contacts/${id}`)); } catch (e) { setMessage((e as Error).message); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await call('/api/contacts', { method: 'POST', body: JSON.stringify({ firstName: first, lastName: last, email, companyId: companyId || null }) });
      setFirst(''); setLast(''); setEmail(''); setCompanyId(''); setMessage('เพิ่ม Contact สำเร็จ'); setPage(1); setReload(current => current + 1);
    } catch (e) { setMessage((e as Error).message); }
  }
  async function link(lineUserId: string, contactId: string) {
    try {
      await call(`/api/contacts/${contactId}/link-line`, { method: 'POST', body: JSON.stringify({ lineUserId }) });
      setMessage('เชื่อม LINE กับ Contact สำเร็จ'); setPage(1); setReload(current => current + 1);
    } catch (e) { setMessage((e as Error).message); }
  }

  return <>
    <section className="contentCard">
      <div className="sectionHead"><div><h3>Contacts</h3><p>ผู้ติดต่อที่เชื่อมกับบริษัทและ LINE · ดูได้ครบทุกคน ครั้งละ 200 ราย</p></div>
        <a className="softButton senderJump" href="#unmapped-line">ดูผู้ส่งที่ยังไม่จับคู่ ({unknown.length}) ↓</a>
      </div>
      <div className="contactLineFilters" role="group" aria-label="กรองสถานะ LINE">
        {[['all', 'ทั้งหมด'], ['linked', 'Linked'], ['unlinked', 'Not linked']].map(([value, label]) =>
          <button key={value} className={lineFilter === value ? 'primary' : 'softButton'} aria-pressed={lineFilter === value} onClick={() => { setLineFilter(value); setPage(1); }}>{label}{pageData ? ` (${pageData.counts[value].toLocaleString()})` : ''}</button>)}
        <button className="softButton contactRefresh" onClick={() => { setPage(1); setReload(current => current + 1); }}>รีเฟรช</button>
      </div>
      <ContactPagination data={pageData} loading={loading} change={setPage} />
      <form className="newLead contactForm" onSubmit={submit}>
        <input aria-label="ชื่อ Contact" placeholder="ชื่อ" value={first} onChange={e => setFirst(e.target.value)} required />
        <input aria-label="นามสกุล Contact" placeholder="นามสกุล" value={last} onChange={e => setLast(e.target.value)} />
        <input aria-label="อีเมล Contact" placeholder="อีเมล" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <select aria-label="บริษัทของ Contact" value={companyId} onChange={e => setCompanyId(e.target.value)}><option value="">ไม่ระบุบริษัท</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="softButton">เพิ่ม Contact</button>
      </form>
      {message && <p className="muted" role="status">{message}</p>}{loadError && <p className="error" role="alert">{loadError}</p>}
      <div className="tableWrap"><table><thead><tr><th>CONTACT</th><th>COMPANY</th><th>EMAIL</th><th>LINE</th></tr></thead><tbody>
        {items.map(c => <tr key={c.id} role="button" tabIndex={0} aria-label={`ดู Contact ${c.first_name} ${c.last_name || ''}`} onClick={() => openContact(c.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openContact(c.id); } }}>
          <td><strong>{c.first_name} {c.last_name}</strong></td><td>{c.company || '—'}</td><td>{c.email || '—'}</td><td><span className={`badge ${c.line_user_id ? 'won' : 'new'}`}>{c.line_user_id ? 'Linked' : 'Not linked'}</span></td>
        </tr>)}
        {!items.length && <tr><td colSpan={4} className="empty">{loading ? 'กำลังโหลด Contacts…' : 'ไม่มี Contact ที่ตรงกับตัวกรองนี้'}</td></tr>}
      </tbody></table></div>
      <ContactPagination data={pageData} loading={loading} change={setPage} />
    </section>
    <section id="unmapped-line" className="contentCard lineSendersSection">
      <div className="sectionHead"><div><h3>Unmapped LINE senders</h3><p>รวมข้อความตามผู้ส่ง · เลือก Contact แล้วกดจับคู่</p></div><span className="badge">{unknown.length} คน</span></div>
      {unknown.map(sender => <SenderCard key={sender.line_user_id} sender={sender} name={senderName(sender.line_user_id)} contacts={linkOptions} link={link} open={() => setSelectedSender(sender)} />)}
      {!unknown.length && <p className="muted">ไม่มีผู้ส่งที่รอจับคู่</p>}
    </section>
    {selectedSender && <SenderConversation key={selectedSender.line_user_id} sender={selectedSender} name={senderName(selectedSender.line_user_id)} call={call} close={() => setSelectedSender(null)} />}
    {selected && <div className="drawerBackdrop" onClick={() => setSelected(null)}><aside className="drawer" role="dialog" aria-modal="true" aria-label="รายละเอียด Contact" onClick={e => e.stopPropagation()}>
      <button className="close" aria-label="ปิดรายละเอียด Contact" onClick={() => setSelected(null)}>×</button><div className="eyebrow">CONTACT DETAILS</div>
      <h2>{selected.contact.first_name} {selected.contact.last_name}</h2><p className="muted">{[selected.contact.company, selected.contact.title].filter(Boolean).join(' · ') || 'ไม่มีบริษัทหรือชื่อตำแหน่ง'}</p>
      <RecordActions entity="contacts" record={selected.contact} call={call} onChanged={async deleted=>{setPage(1);setReload(current=>current+1);if(deleted)setSelected(null);else await openContact(selected.contact.id);await onRecordsChanged?.();}} />
      <div className="drawerBlock"><p>Email: {selected.contact.email || '—'}</p><p>Phone: {selected.contact.phone || '—'}</p><p>LINE: <span className="lineUserId">{selected.contact.line_user_id || '—'}</span></p></div>
      <div className="drawerBlock"><h3>Conversation</h3><p className="muted">ข้อความล่าสุด 100 รายการของ Contact นี้</p><Conversation messages={[...(selected.messages || [])].reverse()} /></div>
      <div className="drawerBlock"><h3>Leads ({selected.leads.length})</h3>{selected.leads.length ? <div className="tableWrap"><table><thead><tr><th>LEAD</th><th>STAGE</th><th>VALUE</th></tr></thead><tbody>{selected.leads.map((lead: any) => <tr key={lead.id} role="button" tabIndex={0} onClick={() => { setSelected(null); openLead(lead.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(null); openLead(lead.id); } }}><td><strong>{lead.title}</strong></td><td>{lead.stage}</td><td>{lead.value ? `฿${Number(lead.value).toLocaleString()}` : '—'}</td></tr>)}</tbody></table></div> : <p className="muted">ยังไม่มี Lead ของ Contact นี้</p>}</div>
    </aside></div>}
  </>;
}
