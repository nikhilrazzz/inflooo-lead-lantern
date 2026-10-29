import { describe, expect, it } from 'vitest';
import { calendarConnectionRequired, googleEventOnDay, makeCallEvent, reminderEventId } from '@/lib/google-calendar';

describe('Personal Google Calendar', () => {
  it('keeps the original calendar accessible without optional Google connection', () => {
    expect(calendarConnectionRequired({ connected: false })).toBe(false);
    expect(calendarConnectionRequired({ connected: true })).toBe(false);
    expect(calendarConnectionRequired({ connected: true, reconnectRequired: true })).toBe(false);
  });
  it('creates stable call events with notification reminders', () => {
    const event = makeCallEvent({ id: 'abc123', remind_at: '2026-10-29T13:30:00Z', note: 'Discuss budget', leads: { full_name: 'Client', phone: '123' } });
    expect(event.start.dateTime).toBe('2026-10-29T13:30:00.000Z');
    expect(event.end.dateTime).toBe('2026-10-29T14:00:00.000Z');
    expect(event.reminders.overrides).toEqual([{ method: 'popup', minutes: 10 }, { method: 'popup', minutes: 0 }]);
    expect(reminderEventId('abcd-1234')).toBe('saleupabcd1234');
  });
  it('uses exclusive calendar-date ends for all-day Google events', () => {
    const event = { id: '1', title: 'Trip', start: '2026-10-21', end: '2026-10-24', allDay: true, url: null };
    expect(googleEventOnDay(event, '2026-10-21')).toBe(true);
    expect(googleEventOnDay(event, '2026-10-23')).toBe(true);
    expect(googleEventOnDay(event, '2026-10-24')).toBe(false);
  });
});