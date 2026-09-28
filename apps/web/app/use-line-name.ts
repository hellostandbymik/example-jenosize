'use client';
import { useEffect, useState } from 'react';

type Call = (path: string, options?: RequestInit) => Promise<any>;
type Entry = { expires: number; result: Promise<string | null> };
// Keep requests shared within one signed-in session, with no persistent profile data.
const sessions = new WeakMap<Call, Map<string, Entry>>();

function readName(userId: string, call: Call): Promise<string | null> {
  let cache = sessions.get(call);
  if (!cache) { cache = new Map(); sessions.set(call, cache); }
  const cached = cache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.result;
  const entry: Entry = { expires: Date.now() + 60_000, result: Promise.resolve(null) };
  entry.result = call(`/api/contacts/line/${encodeURIComponent(userId)}/profile`)
    .then(profile => {
      const name = typeof profile.display_name === 'string' ? profile.display_name.trim() : '';
      if (name) entry.expires = Date.now() + 5 * 60_000;
      return name || null;
    }).catch(() => null);
  cache.set(userId, entry);
  return entry.result;
}

export default function useLineName(userId: string | null | undefined, call: Call): string {
  const [profile, setProfile] = useState<{ userId: string; call: Call; name: string | null } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void readName(userId, call).then(name => { if (active) setProfile({ userId, call, name }); });
    return () => { active = false; };
  }, [userId, call]);
  if (!userId) return 'ยังไม่ได้จับคู่ LINE';
  if (profile?.userId !== userId || profile.call !== call) return 'กำลังโหลดชื่อ LINE…';
  return profile.name || 'ไม่พบชื่อโปรไฟล์ LINE';
}
