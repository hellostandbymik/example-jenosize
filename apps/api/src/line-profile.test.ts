import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLineProfile } from './line-profile.js';

describe('LINE profile lookup', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('deduplicates simultaneous lookups and caches the name', async () => {
    vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN', 'synthetic-token');
    const fetchProfile = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ displayName: 'ผู้ส่งทดสอบ', userId: 'private', pictureUrl: 'private' }) });
    vi.stubGlobal('fetch', fetchProfile);
    const user = 'U11111111111111111111111111111111';
    expect(await Promise.all([getLineProfile(user), getLineProfile(user)])).toEqual([{ display_name: 'ผู้ส่งทดสอบ' }, { display_name: 'ผู้ส่งทดสอบ' }]);
    expect(await getLineProfile(user)).toEqual({ display_name: 'ผู้ส่งทดสอบ' });
    expect(fetchProfile).toHaveBeenCalledOnce();
  });
  it('keeps conversation browsing usable if LINE fails', async () => {
    vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN', 'synthetic-token');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private network detail')));
    expect(await getLineProfile('U22222222222222222222222222222222')).toEqual({ display_name: null });
  });
  it('does not call LINE when the token is missing or the ID is invalid', async () => {
    const fetchProfile = vi.fn(); vi.stubGlobal('fetch', fetchProfile);
    vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN', '');
    expect(await getLineProfile('U33333333333333333333333333333333')).toEqual({ display_name: null });
    vi.stubEnv('LINE_CHANNEL_ACCESS_TOKEN', 'synthetic-token');
    expect(await getLineProfile('../../secret')).toEqual({ display_name: null });
    expect(fetchProfile).not.toHaveBeenCalled();
  });
});
