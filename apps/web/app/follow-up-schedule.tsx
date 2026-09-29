'use client';
import { useState, type FormEvent } from 'react';
import { thaiInput, thaiISO } from './follow-up-utils';
export type APICall = (path: string, options?: RequestInit) => Promise<any>;
type Props = { id: string; due: string | null; call: APICall; onSaved: () => Promise<void> | void };

export default function FollowUpSchedule({ id, due, call, onSaved }: Props) {
  const [value, setValue] = useState(due ? thaiInput(due) : '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setSaved(false); setBusy(true);
    try {
      const nextFollowUp = value ? due && value === thaiInput(due) ? due : thaiISO(value) : null;
      await call(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ nextFollowUp }) });
      await onSaved();
      setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง'); }
    finally { setBusy(false); }
  }
  return <form className="followSchedule" onSubmit={save}>
    <label htmlFor={`follow-date-${id}`}>วันและเวลาติดตามครั้งถัดไป <small>เวลาไทย (GMT+7)</small></label>
    <div><input id={`follow-date-${id}`} type="datetime-local" value={value} onChange={event => { setValue(event.target.value); setSaved(false); }} disabled={busy}/>
      <button type="submit" className="primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกนัด'}</button></div>
    <p className="muted">เว้นว่างเพื่อนำวันนัดออก · การเปลี่ยนนัดจะบันทึกในประวัติ Lead</p>
    {error && <p className="error" role="alert">{error}</p>}
    {saved && <p className="followSuccess" role="status">บันทึกวันนัดแล้ว</p>}
  </form>;
}
