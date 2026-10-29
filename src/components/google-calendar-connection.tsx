import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { useMe, useReminders } from '@/lib/data';
import { type GoogleEvent } from '@/lib/google-calendar';
import { completeGoogleCalendarConnect, disconnectGoogleCalendar, getGoogleCalendarStatus, startGoogleCalendarConnect, syncMyGoogleCalendar } from '@/lib/google-calendar.functions';

type CalendarContext = { events: GoogleEvent[]; setRange: (from: string, to: string) => void; loading: boolean; connected: boolean; reconnectRequired: boolean; busy: boolean; connect: () => Promise<void>; unlink: () => Promise<void>; refresh: () => void; error: boolean };
const CalendarCtx = createContext<CalendarContext | null>(null);
export function useGoogleCalendar() {
  const value = useContext(CalendarCtx);
  if (!value) throw new Error('Google Calendar context missing');
  return value;
}

function waitForCompletion(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const timeout = window.setTimeout(() => { cleanup(); popup.close(); reject(new Error('Connection timed out. Please try again.')); }, 5 * 60_000);
    const cleanup = () => { window.removeEventListener('message', onMessage); if (poll !== undefined) window.clearInterval(poll); window.clearTimeout(timeout); };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (event.origin !== window.location.origin || event.source !== popup || event.data?.connectorId !== 'google_calendar' || !['appUserConnectorOAuthComplete', 'appUserConnectorOAuthFailed'].includes(type)) return;
      cleanup();
      if (type === 'appUserConnectorOAuthComplete') resolve(typeof event.data.code === 'string' ? event.data.code : null);
      else reject(new Error('Google Calendar consent was not completed. Please try again.'));
    };
    window.addEventListener('message', onMessage);
    poll = window.setInterval(() => { if (popup.closed) { cleanup(); reject(new Error('Connection window closed. Please try again.')); } }, 500);
  });
}

export function GoogleCalendarConnection({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: reminders = [] } = useReminders();
  const start = useServerFn(startGoogleCalendarConnect);
  const complete = useServerFn(completeGoogleCalendarConnect);
  const disconnect = useServerFn(disconnectGoogleCalendar);
  const statusFn = useServerFn(getGoogleCalendarStatus);
  const syncFn = useServerFn(syncMyGoogleCalendar);
  const [busy, setBusy] = useState(false);
  const [range, setRangeState] = useState(() => ({ from: new Date(Date.now() - 30 * 86400000).toISOString(), to: new Date(Date.now() + 60 * 86400000).toISOString() }));
  const status = useQuery({ queryKey: ['google-calendar-status', me?.id], queryFn: () => statusFn(), enabled: !!me, retry: false });
  const signature = reminders.filter(r => r.user_id === me?.id).map(r => `${r.id}:${r.remind_at}:${r.completed}:${r.note}`).join('|');
  const calendar = useQuery({ queryKey: ['google-calendar-events', me?.id, range, signature], queryFn: () => syncFn({ data: range }), enabled: !!me && status.data?.connected === true, refetchInterval: 30_000, retry: false });
  const reconnectRequired = status.data?.reconnectRequired || calendar.data?.reconnectRequired;

  useEffect(() => {
    if (calendar.data?.reconnectRequired) qc.invalidateQueries({ queryKey: ['google-calendar-status'] });
  }, [calendar.data?.reconnectRequired, qc]);


  async function connect() {
    const popup = window.open('', 'saleup-google-calendar', 'width=600,height=720');
    if (!popup) { toast.error('Allow popups to connect Google Calendar.'); return; }
    setBusy(true);
    try {
      const { authorizationUrl } = await start();
      const completion = waitForCompletion(popup);
      popup.location.href = authorizationUrl;
      const code = await completion;
      if (!code) throw new Error('Consent completed, but ongoing access is disabled. Ask your workspace admin to enable offline access.');
      await complete({ data: { code } });
      await qc.invalidateQueries({ queryKey: ['google-calendar-status'] });
      await qc.invalidateQueries({ queryKey: ['google-calendar-events'] });
      toast.success(reconnectRequired ? 'Reconnected to Google Calendar' : 'Connected to Google Calendar');
    } catch (error) { popup.close(); toast.error((error as Error).message); }
    finally { setBusy(false); }
  }
  async function unlink() {
    setBusy(true);
    try { await disconnect(); qc.removeQueries({ queryKey: ['google-calendar-events'] }); await qc.invalidateQueries({ queryKey: ['google-calendar-status'] }); toast.success('Google Calendar disconnected'); }
    catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }
  const value: CalendarContext = {
    events: calendar.data?.connected ? calendar.data.events : [],
    loading: calendar.isFetching,
    setRange: (from, to) => setRangeState(previous => previous.from === from && previous.to === to ? previous : { from, to }),
    connected: status.data?.connected === true && !reconnectRequired,
    reconnectRequired: !!reconnectRequired,
    busy, connect, unlink, refresh: () => { calendar.refetch(); }, error: calendar.isError || status.isError,
  };
  return <CalendarCtx.Provider value={value}>{children}</CalendarCtx.Provider>;
}
