export type FollowUpLead = { id: string; title: string; stage: string; owner_id: string; owner: string; company: string | null; contact_first: string | null; contact_last: string | null; next_follow_up: string | null };
export type FollowUpFilter = 'all' | 'overdue' | 'today' | 'week' | 'unscheduled';
const offset = 7 * 60 * 60 * 1000;
export function thaiDate(instant: string | number | Date = Date.now()) {
  return new Date(new Date(instant).getTime() + offset).toISOString().slice(0, 10);
}
export function thaiInput(instant: string) { return new Date(new Date(instant).getTime() + offset).toISOString().slice(0, 16); }
export function thaiISO(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) throw new Error('กรุณาระบุวันและเวลา');
  const date = new Date(`${input}:00+07:00`);
  if (!Number.isFinite(date.getTime()) || thaiInput(date.toISOString()) !== input) throw new Error('วันหรือเวลาไม่ถูกต้อง');
  return date.toISOString();
}
export function addDays(day: string, count: number) { const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + count); return date.toISOString().slice(0, 10); }
export function shiftMonth(month: string, count: number) { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + count); return date.toISOString().slice(0, 7); }
export function monthDays(month: string) {
  const first = `${month}-01`, start = new Date(`${first}T00:00:00Z`).getUTCDay();
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  return Array.from({ length: Math.ceil((start + Number(last.slice(-2))) / 7) * 7 }, (_, i) => addDays(first, i - start));
}
export function matchesFilter(lead: FollowUpLead, filter: FollowUpFilter, now: number) {
  const due = lead.next_follow_up;
  if (filter === 'all') return Boolean(due);
  if (filter === 'unscheduled') return !due;
  if (!due) return false;
  const day = thaiDate(due), today = thaiDate(now);
  if (filter === 'overdue') return new Date(due).getTime() < now;
  if (filter === 'today') return day === today;
  return day >= today && day <= addDays(today, 6);
}
export const formatDay = (day: string) => new Date(`${day}T00:00:00+07:00`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });
export const formatTime = (due: string) => new Date(due).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
