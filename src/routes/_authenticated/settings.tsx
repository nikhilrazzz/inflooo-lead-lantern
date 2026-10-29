import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useGoogleCalendar } from '@/components/google-calendar-connection';
import { useNotificationPreferences } from '@/lib/notification-data';
import { useMe } from '@/lib/data';
import { supabase } from '@/integrations/supabase/client';
import { disablePush, getPushPublicKey, savePushSubscription } from '@/lib/notifications.functions';

export const Route = createFileRoute('/_authenticated/settings')({ head: () => ({ meta: [
  { title: 'Settings — SaleUp' }, { name: 'description', content: 'Manage optional Google Calendar connections and SaleUp call notifications.' },
  { property: 'og:title', content: 'Settings — SaleUp' }, { property: 'og:description', content: 'Manage optional Google Calendar connections and SaleUp call notifications.' },
  { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
] }), component: SettingsPage });

function SettingsPage() {
  const calendar = useGoogleCalendar();
  const { data: prefs } = useNotificationPreferences();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const getKey = useServerFn(getPushPublicKey);
  const save = useServerFn(savePushSubscription);
  const disable = useServerFn(disablePush);
  const [permission, setPermission] = useState<string>('default');
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSupported('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext);
    setPermission('Notification' in window ? Notification.permission : 'unsupported');
  }, []);
  async function toggleInApp(enabled: boolean) {
    if (!me) return;
    const { error } = await supabase.from('notification_preferences').upsert({ user_id: me.id, in_app_enabled: enabled, push_enabled: prefs?.push_enabled ?? false });
    if (error) { toast.error('Could not save notification settings'); return; }
    await qc.invalidateQueries({ queryKey: ['notification-preferences'] });
  }
  async function enableNotifications() {
    setBusy(true);
    try {
      await toggleInApp(true);
      if (!supported) { toast.info('In-app alerts are enabled. Background notifications are not supported in this browser.'); return; }
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') { toast.info(result === 'denied' ? 'Browser notifications are blocked. In-app alerts remain enabled.' : 'In-app alerts enabled; browser permission was not granted.'); return; }
      const { publicKey } = await getKey();
      const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
      const registration = await navigator.serviceWorker.register('/push-notifications.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      const json = subscription.toJSON();
      const p256dh = json.keys?.['p256dh'];
      const auth = json.keys?.['auth'];
      if (!p256dh || !auth) throw new Error('Browser subscription is incomplete');
      await save({ data: { endpoint: subscription.endpoint, keys: { p256dh, auth } } });
      await qc.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Notifications enabled');
    } catch { toast.error('Background notifications could not be enabled in this browser. In-app call alerts are still enabled.'); }
    finally { setBusy(false); }
  }
  async function disableNotifications() {
    setBusy(true);
    try {
      await disable();
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration('/push-notifications.js');
        const subscription = await registration?.pushManager.getSubscription();
        await subscription?.unsubscribe();
      }
      await qc.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Background notifications disabled');
    } catch { toast.error('Could not disable background notifications'); }
    finally { setBusy(false); }
  }
  const state = !supported ? 'Unsupported' : permission === 'denied' ? 'Blocked' : prefs?.push_enabled && permission === 'granted' ? 'Enabled' : 'Disabled';
  return <div className="mx-auto max-w-3xl space-y-8">
    <h1 className="text-3xl font-bold">Settings</h1>
    <section className="space-y-5 border-b pb-8">
      <h2 className="flex items-center gap-2 text-lg font-bold"><CalendarDays className="h-5 w-5 text-primary" /> Google Calendar <span className="text-sm font-normal text-muted-foreground">Optional</span></h2>
      <p className="text-sm text-muted-foreground">{calendar.connected ? `Connected for ${me?.email}` : calendar.reconnectRequired ? 'Google Calendar access needs to be renewed.' : 'Not connected'}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={calendar.connect} disabled={calendar.busy}><CalendarDays className="h-4 w-4" />{calendar.busy ? 'Connecting…' : calendar.connected || calendar.reconnectRequired ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}</Button>
        {calendar.connected && <><Button variant="outline" onClick={calendar.refresh} disabled={calendar.loading}><RefreshCw className="h-4 w-4" /> Sync now</Button><Button variant="ghost" onClick={calendar.unlink} disabled={calendar.busy}><Unplug className="h-4 w-4" /> Disconnect</Button></>}
      </div>
      {calendar.error && <p role="alert" className="text-sm text-destructive">Google Calendar could not sync. SaleUp’s calendar and reminders remain available.</p>}
    </section>
    <section className="space-y-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Bell className="h-5 w-5 text-primary" /> Notifications</h2>
      <label className="flex items-center justify-between gap-4"><span className="text-sm font-medium">In-app call alerts</span><Switch checked={prefs?.in_app_enabled ?? true} onCheckedChange={toggleInApp} aria-label="In-app call alerts" /></label>
      <div className="flex items-center justify-between gap-4"><span className="text-sm font-medium">Background browser notifications</span><span className={state === 'Enabled' ? 'text-sm text-success' : 'text-sm text-muted-foreground'}>{state}</span></div>
      {permission === 'denied' && <p className="text-sm text-destructive">Notifications are blocked. Open your browser’s site settings, allow notifications for SaleUp, then enable them here.</p>}
      {!supported && <p className="text-sm text-muted-foreground">This browser cannot receive background notifications. In-app call alerts remain available.</p>}
      <div className="flex flex-wrap gap-2"><Button onClick={enableNotifications} disabled={busy || state === 'Enabled'}><Bell className="h-4 w-4" />{busy ? 'Saving…' : 'Enable Notifications'}</Button>{prefs?.push_enabled && <Button variant="outline" onClick={disableNotifications} disabled={busy}>Disable background notifications</Button>}</div>
    </section>
  </div>;
}