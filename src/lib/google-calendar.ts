export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar.events',
];

export type GoogleEvent = { id: string; title: string; start: string; end: string; allDay: boolean; url: string | null };

export function calendarConnectionRequired(_state: { connected: boolean; reconnectRequired?: boolean }) {
  return false;
}

export function reminderEventId(id: string) { return `saleup${id.replace(/-/g, '').toLowerCase()}`; }

export function makeCallEvent(reminder: { id: string; remind_at: string; note: string | null; leads: { full_name: string; phone: string | null } | null }) {
  return {
    id: reminderEventId(reminder.id),
    summary: `SaleUp · Call ${reminder.leads?.full_name || 'lead'}`,
    description: [reminder.note, reminder.leads?.phone ? `Phone: ${reminder.leads.phone}` : null].filter(Boolean).join('\n'),
    start: { dateTime: new Date(reminder.remind_at).toISOString() },
    end: { dateTime: new Date(new Date(reminder.remind_at).getTime() + 30 * 60_000).toISOString() },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }, { method: 'popup', minutes: 0 }] },
    extendedProperties: { private: { saleupReminderId: reminder.id } },
  };
}

/** Calendar-date comparison: Google's all-day end is exclusive; no timezone conversion. */
export function googleEventOnDay(event: GoogleEvent, day: string) {
  if (event.allDay) return event.start <= day && day < event.end;
  const localKey = (value: string) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  return localKey(event.start) <= day && day <= localKey(event.end);
}