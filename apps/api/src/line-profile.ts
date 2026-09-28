export type LineProfile = { display_name: string | null };
const profiles = new Map<string, { expires: number; result: Promise<LineProfile> }>();

export function getLineProfile(userId: string): Promise<LineProfile> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token || !/^U[0-9a-f]{32}$/.test(userId)) return Promise.resolve({ display_name: null });
  const cached = profiles.get(userId);
  if (cached && cached.expires > Date.now()) return cached.result;
  if (profiles.size >= 500) profiles.delete(profiles.keys().next().value!);
  const entry = { expires: Date.now() + 60_000, result: Promise.resolve<LineProfile>({ display_name: null }) };
  entry.result = (async () => {
    try {
      const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
        headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return { display_name: null };
      const profile = await response.json() as { displayName?: unknown };
      if (typeof profile.displayName !== 'string') return { display_name: null };
      entry.expires = Date.now() + 30 * 60_000;
      return { display_name: profile.displayName };
    } catch { return { display_name: null }; }
  })();
  profiles.set(userId, entry);
  return entry.result;
}
