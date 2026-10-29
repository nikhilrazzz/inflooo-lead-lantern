import { describe, expect, it } from 'vitest';
import { allowedPushEndpoint, reminderAlertKey, shouldAlert } from '@/lib/notifications';

describe('Call notifications', () => {
  const reminder = { id: 'call', remind_at: '2026-10-29T13:00:00Z', completed: false, user_id: 'owner' };
  it('alerts only the intended recipient when the call is due', () => {
    expect(shouldAlert(reminder, 'owner', Date.parse('2026-10-29T13:00:00Z'), new Set())).toBe(true);
    expect(shouldAlert(reminder, 'other', Date.parse('2026-10-29T13:00:00Z'), new Set())).toBe(false);
    expect(shouldAlert(reminder, 'owner', Date.parse('2026-10-29T12:59:59Z'), new Set())).toBe(false);
    expect(shouldAlert({ ...reminder, completed: true }, 'owner', Date.parse('2026-10-29T13:00:00Z'), new Set())).toBe(false);
  });
  it('does not repeat dismissed alerts but allows a rescheduled call', () => {
    const dismissed = new Set([reminderAlertKey(reminder)]);
    expect(shouldAlert(reminder, 'owner', Date.parse('2026-10-29T14:00:00Z'), dismissed)).toBe(false);
    expect(shouldAlert({ ...reminder, remind_at: '2026-10-29T13:30:00Z' }, 'owner', Date.parse('2026-10-29T14:00:00Z'), dismissed)).toBe(true);
  });
  it('rejects arbitrary subscription hosts and insecure endpoints', () => {
    expect(allowedPushEndpoint('https://fcm.googleapis.com/fcm/send/123')).toBe(true);
    expect(allowedPushEndpoint('https://web.push.apple.com/123')).toBe(true);
    expect(allowedPushEndpoint('https://localhost/private')).toBe(false);
    expect(allowedPushEndpoint('https://fcm.googleapis.com.attacker.com/123')).toBe(false);
    expect(allowedPushEndpoint('http://fcm.googleapis.com/123')).toBe(false);
  });
});