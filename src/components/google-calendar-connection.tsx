import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Bell, CalendarDays, CheckCircle2, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMe, useReminders } from '@/lib/data';
import { calendarConnectionRequired, type GoogleEvent } from '@/lib/google-calendar';
import { completeGoogleCalendarConnect, disconnectGoogleCalendar, getGoogleCalendarStatus, startGoogleCalendarConnect, syncMyGoogleCalendar } from '@/lib/google-calendar.functions';

type CalendarContext = { events: GoogleEvent[]; setRange: (from: string, to: string) => void; loading: boolean };
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
  const [permission, setPermission] = useState<string>('default');
  const [range, setRangeState] = useState(() => ({ from: new Date(Date.now() - 30 * 86400000).toISOString(), to: new Date(Date.now() + 60 * 86400000).toISOString() }));
  const status = useQuery({ queryKey: ['google-calendar-status', me?.id], queryFn: () => statusFn(), enabled: !!me, retry: false });
  const signature = reminders.filter(r => r.user_id === me?.id).map(r => `${r.id}:${r.remind_at}:${r.completed}:${r.note}`).join('|');
  const calendar = useQuery({ queryKey: ['google-calendar-events', me?.id, range, signature], queryFn: () => syncFn({ data: range }), enabled: !!me && status.data?.connected === true, refetchInterval: 30_000, retry: false });
  const reconnectRequired = status.data?.reconnectRequired || calendar.data?.reconnectRequired;
  const required = !status.data || calendarConnectionRequired(status.data) || reconnectRequired;
  useEffect(() => { if (typeof Notification !== 'undefined') setPermission(Notification.permission); }, []);
  useEffect(() => {
    if (calendar.data?.reconnectRequired) qc.invalidateQueries({ queryKey: ['google-calendar-status'] });
  }, [calendar.data?.reconnectRequired, qc]);
  const value = useMemo(() => ({ events: calendar.data?.events ?? [], loading: calendar.isFetching, setRange: (from: string, to: string) => setRangeState(previous => previous.from === from && previous.to === to ? previous : { from, to }) }), [calendar.data?.events, calendar.isFetching]);

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
  async function notifications() {
    if (typeof Notification === 'undefined') { toast.error('This browser does not support desktop notifications.'); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'denied') toast.error('Notifications are blocked. Allow them in your browser settings.');
    else if (result === 'granted') toast.success('SaleUp notifications enabled');
  }

  return <CalendarCtx.Provider value={value}>
    {required ? <section className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <CalendarDays className="mb-5 h-12 w-12 text-primary" />
      <h1 className="text-2xl font-bold">{reconnectRequired ? 'Reconnect Google Calendar' : 'Connect your Google Calendar'}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{me?.email}</p>
      {status.isPending ? <p className="mt-6 text-sm text-muted-foreground">Checking your calendar connection…</p> : status.isError ? <><p role="alert" className="mt-6 text-sm text-destructive">Could not check your calendar connection.</p><Button className="mt-4" onClick={() => status.refetch()}><RefreshCw className="h-4 w-4" /> Try again</Button></> : <><p className="mt-3 text-sm text-muted-foreground">{reconnectRequired ? 'Your Google Calendar access needs to be renewed.' : 'Your Google Calendar connection is required to continue.'}</p><Button className="mt-6" onClick={connect} disabled={busy}><CalendarDays className="h-4 w-4" />{busy ? 'Connecting…' : reconnectRequired ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}</Button></>}
    </section> : <>
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b pb-4">
        <span className="mr-auto flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" />Google Calendar connected</span>
        <Button variant="ghost" size="sm" onClick={notifications} disabled={permission === 'granted'}><Bell className="h-4 w-4" />{permission === 'granted' ? 'Notifications on' : 'Enable notifications'}</Button>
        <Button variant="ghost" size="icon" title="Refresh Google Calendar" aria-label="Refresh Google Calendar" onClick={() => calendar.refetch()} disabled={calendar.isFetching}><RefreshCw className={calendar.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /></Button>
        <Button variant="ghost" size="icon" title="Reconnect Google Calendar" aria-label="Reconnect Google Calendar" onClick={connect} disabled={busy}><CalendarDays className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" title="Disconnect Google Calendar" aria-label="Disconnect Google Calendar" onClick={unlink} disabled={busy}><Unplug className="h-4 w-4" /></Button>
      </div>
      {calendar.isError && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 text-sm text-destructive"><span>Google Calendar could not sync. Your SaleUp reminders are still saved.</span><Button size="sm" variant="outline" onClick={() => calendar.refetch()}>Try again</Button></div>}
      {children}
    </>}
  </CalendarCtx.Provider>;
}