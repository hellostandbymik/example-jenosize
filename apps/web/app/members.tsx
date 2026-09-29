'use client';
import { useEffect, useState } from 'react';
type Call = (path: string, options?: RequestInit) => Promise<any>;
type Member = { id: string; name: string; email: string; role: string; active: boolean; lead_count: number };
export default function Members({ call, currentId, onChanged }: { call: Call; currentId: string; onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Member | null>(null);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [role, setRole] = useState('sales'); const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function load() { const data = await call('/api/members'); setItems(data.items); }
  useEffect(() => { let live = true; call('/api/members').then(data => { if (live) setItems(data.items); }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [call]);
  function choose(member: Member | null) { setSelected(member); setName(member?.name || ''); setEmail(member?.email || ''); setPassword(''); setRole(member?.role === 'super_admin' ? 'super_admin' : 'sales'); setActive(member?.active ?? true); setError(''); setMessage(''); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const body: Record<string, unknown> = { name, email };
      if (!selected || selected.role !== role) body.role = role;
      if (!selected || selected.active !== active) body.active = active;
      if (password) body.password = password;
      await call(selected ? `/api/members/${selected.id}` : '/api/members', { method: selected ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (selected?.id === currentId && password) { window.localStorage.removeItem('crm-token'); window.location.reload(); return; }
      await load(); await onChanged(); choose(null); setMessage('บันทึกสมาชิกสำเร็จ');
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); } finally { setBusy(false); }
  }
  return <section className="contentCard" aria-busy={loading}>
    <div className="sectionHead"><div><h3>Members ({items.length})</h3><p>Super Admin เห็นทุก Lead · สมาชิกเห็นเฉพาะ Lead ที่ตนรับผิดชอบ</p></div></div>
    <form className="memberForm" onSubmit={submit}>
      <h4>{selected ? `แก้ไขสมาชิก: ${selected.name}` : 'เพิ่มสมาชิก'}</h4>
      <div className="recordFields">
        <label>ชื่อ<input value={name} required minLength={2} disabled={busy} onChange={e => setName(e.target.value)} /></label>
        <label>อีเมล<input type="email" value={email} required disabled={busy} onChange={e => setEmail(e.target.value)} /></label>
        <label>{selected ? 'รหัสผ่านใหม่ (เว้นว่างเพื่อใช้รหัสเดิม)' : 'รหัสผ่าน'}<input type="password" autoComplete="new-password" value={password} minLength={8} maxLength={100} required={!selected} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
        <label>สิทธิ์<select value={role} disabled={busy || selected?.id === currentId} onChange={e => setRole(e.target.value)}><option value="sales">สมาชิกฝ่ายขาย</option><option value="super_admin">Super Admin</option></select></label>
        <label>สถานะ<select value={active ? 'active' : 'inactive'} disabled={busy || selected?.id === currentId} onChange={e => setActive(e.target.value === 'active')}><option value="active">ใช้งาน</option><option value="inactive">ปิดใช้งาน</option></select></label>
      </div>
      {selected && <p className="muted">การเปลี่ยนรหัสผ่าน สิทธิ์ หรือปิดบัญชี จะยกเลิก session เดิมของสมาชิก</p>}
      <div className="recordDialogFooter">{selected && <button type="button" className="softButton" disabled={busy} onClick={() => choose(null)}>ยกเลิกการแก้ไข</button>}<button className="primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : selected ? 'บันทึกการแก้ไข' : 'เพิ่มสมาชิก'}</button></div>
    </form>
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="tableWrap"><table className="recordTable"><thead><tr><th>สมาชิก</th><th>อีเมล</th><th>สิทธิ์</th><th>สถานะ</th><th>LEADS</th><th>จัดการ</th></tr></thead><tbody>
      {items.map(member => <tr key={member.id}><td data-label="สมาชิก"><strong>{member.name}</strong>{member.id === currentId && <small>บัญชีปัจจุบัน</small>}</td><td data-label="อีเมล">{member.email}</td><td data-label="สิทธิ์">{member.role === 'super_admin' ? 'Super Admin' : 'สมาชิกฝ่ายขาย'}</td><td data-label="สถานะ"><span className={`badge ${member.active ? 'won' : 'lost'}`}>{member.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td><td data-label="Leads">{member.lead_count}</td><td data-label="จัดการ"><button className="softButton" disabled={busy} onClick={() => { choose(member); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>แก้ไข</button></td></tr>)}
      {!items.length && <tr><td colSpan={6} className="empty">{loading ? 'กำลังโหลดสมาชิก…' : 'ไม่มีสมาชิก'}</td></tr>}
    </tbody></table></div>
  </section>;
}
