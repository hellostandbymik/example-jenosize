import { describe, expect, it } from 'vitest';
import { addDays, matchesFilter, monthDays, shiftMonth, thaiDate, thaiInput, thaiISO, type FollowUpLead } from './follow-up-utils';
const lead = (due: string | null) => ({ next_follow_up: due } as FollowUpLead);
describe('Follow up dates in Thailand', () => {
  it('keeps the Thai day and input across the UTC midnight boundary', () => {
    expect(thaiDate('2026-09-29T17:30:00Z')).toBe('2026-09-30');
    expect(thaiInput('2026-09-29T17:30:00Z')).toBe('2026-09-30T00:30');
    expect(thaiISO('2026-09-30T00:30')).toBe('2026-09-29T17:30:00.000Z');
  });
  it('rejects invalid or normalized calendar dates', () => {
    for (const value of ['', '2026-02-30T09:00', '2026-09-29T25:00', 'nonsense']) expect(() => thaiISO(value)).toThrow();
  });
  it('distinguishes overdue time from all appointments today', () => {
    const now = Date.parse('2026-09-29T03:00:00Z'); // 10:00 in Thailand
    expect(matchesFilter(lead('2026-09-29T02:00:00Z'), 'overdue', now)).toBe(true);
    expect(matchesFilter(lead('2026-09-29T04:00:00Z'), 'overdue', now)).toBe(false);
    expect(matchesFilter(lead('2026-09-28T17:30:00Z'), 'today', now)).toBe(true);
    expect(matchesFilter(lead('2026-09-29T17:00:00Z'), 'today', now)).toBe(false);
  });
  it('includes seven Thai calendar days and separates missing schedules', () => {
    const now = Date.parse('2026-09-29T03:00:00Z');
    expect(matchesFilter(lead('2026-10-05T16:59:00Z'), 'week', now)).toBe(true);
    expect(matchesFilter(lead('2026-10-05T17:00:00Z'), 'week', now)).toBe(false);
    expect(matchesFilter(lead(null), 'all', now)).toBe(false);
    expect(matchesFilter(lead(null), 'unscheduled', now)).toBe(true);
  });
  it('builds complete calendar weeks including leap days and year transitions', () => {
    const days = monthDays('2028-02');
    expect(days).toContain('2028-02-29');
    expect(days[0]).toBe('2028-01-30');
    expect(days.length % 7).toBe(0);
    expect(new Set(days).size).toBe(days.length);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
