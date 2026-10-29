import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { isAllowedEmail } from './access';
import { GOOGLE_CALENDAR_SCOPES, makeCallEvent, type GoogleEvent } from './google-calendar';

const GATEWAY_BASE_URL = 'https://connector-gateway.lovable.dev';
const connectorId = 'google_calendar';
function checkTeam(claims: unknown) {
  const email = (claims as { email?: string }).email;
  if (!isAllowedEmail(email)) throw new Error('Only company team members can connect a calendar');
}

export const getGoogleCalendarStatus = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  checkTeam(context.claims);
  const { getConnectionKeyForUser } = await import('./appUserConnections.server');
  const connection = await getConnectionKeyForUser(context.userId, connectorId);
  return { connected: !!connection && !connection.reconnectRequired, reconnectRequired: connection?.reconnectRequired ?? false };
});

export const startGoogleCalendarConnect = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  checkTeam(context.claims);
  const clientAPIKey = process.env['GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY'];
  if (!clientAPIKey) throw new Error('Google Calendar setup is not complete');
  const request = getRequest();
  const url = new URL(request.url);
  const sandboxHost = url.hostname === 'localhost' ? request.headers.get('x-forwarded-host') : null;
  const returnUrl = new URL('/api/public/oauth/google-calendar/return', sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
  const { getConnectionKeyForUser } = await import('./appUserConnections.server');
  const { authorizeAppUserOAuth } = await import('@/integrations/lovable/appUserConnector');
  const connection = await getConnectionKeyForUser(context.userId, connectorId);
  const { authorizationUrl } = await authorizeAppUserOAuth({ gatewayBaseUrl: GATEWAY_BASE_URL, connectorId, appUserId: context.userId, clientAPIKey, returnUrl, connectionAPIKey: connection?.key, credentialsConfiguration: { scopes: GOOGLE_CALENDAR_SCOPES } });
  return { authorizationUrl };
});

export const completeGoogleCalendarConnect = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().min(1).max(4096) }).parse(input))
  .handler(async ({ context, data }) => {
    checkTeam(context.claims);
    const { exchangeAppUserOAuthCode } = await import('@/integrations/lovable/appUserConnector');
    const { saveConnectionKeyForUser } = await import('./appUserConnections.server');
    const result = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (result.connectorId !== connectorId) throw new Error('Unexpected calendar connection');
    await saveConnectionKeyForUser(context.userId, connectorId, result.connectionAPIKey);
    return { ok: true };
  });

export const disconnectGoogleCalendar = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  checkTeam(context.claims);
  const { getConnectionKeyForUser } = await import('./appUserConnections.server');
  const { disconnectAppUser } = await import('@/integrations/lovable/appUserConnector');
  const connection = await getConnectionKeyForUser(context.userId, connectorId);
  if (connection) await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectorId, connectionAPIKey: connection.key });
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('app_user_connections').delete().eq('user_id', context.userId).eq('connector_id', connectorId);
  if (error) throw error;
  return { ok: true };
});

/** Reconcile only the authenticated user's calls; stable IDs make retries idempotent. */
export const syncMyGoogleCalendar = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ from: z.string().datetime(), to: z.string().datetime() }).refine(d => Date.parse(d.to) > Date.parse(d.from) && Date.parse(d.to) - Date.parse(d.from) <= 100 * 86400000, 'Invalid calendar range').parse(input))
  .handler(async ({ context, data }) => {
    checkTeam(context.claims);
    const { getConnectionKeyForUser } = await import('./appUserConnections.server');
    const { callAsAppUser, appUserReconnectRequired } = await import('@/integrations/lovable/appUserConnector');
    const connection = await getConnectionKeyForUser(context.userId, connectorId);
    const empty = { connected: false, reconnectRequired: connection?.reconnectRequired ?? false, events: [] as GoogleEvent[], synced: 0 };
    if (!connection || connection.reconnectRequired) return empty;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    let reconnect = false;
    async function call(path: string, init?: RequestInit, allowed: number[] = []) {
      const response = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: connection?.key ?? '', connectorId, path, init, requiredScopes: GOOGLE_CALENDAR_SCOPES });
      if (await appUserReconnectRequired(response)) {
        reconnect = true;
        const { error } = await supabaseAdmin.from('app_user_connections').update({ reconnect_required: true }).eq('user_id', context.userId).eq('connector_id', connectorId);
        if (error) throw error;
        return null;
      }
      if (!response.ok && !allowed.includes(response.status)) {
        const body = await response.text();
        console.error(`Google Calendar failed [${response.status}]: ${body}`);
        throw new Error(`Google Calendar failed [${response.status}]: ${body}`);
      }
      return response;
    }
    const { data: reminders, error } = await context.supabase.from('reminders').select('*,leads(full_name,phone)').eq('user_id', context.userId);
    if (error) throw error;
    const { data: mappings, error: mappingError } = await supabaseAdmin.from('google_calendar_reminders').select('*').eq('user_id', context.userId);
    if (mappingError) throw mappingError;
    let synced = 0;
    const active = (reminders ?? []).filter(r => !r.completed);
    for (const mapping of mappings ?? []) {
      if (active.some(r => r.id === mapping.reminder_id)) continue;
      const response = await call(`/calendar/v3/calendars/primary/events/${encodeURIComponent(mapping.event_id)}`, { method: 'DELETE' }, [404, 410]);
      if (!response) break;
      const { error: removeError } = await supabaseAdmin.from('google_calendar_reminders').delete().eq('user_id', context.userId).eq('reminder_id', mapping.reminder_id);
      if (removeError) throw removeError;
    }
    for (const reminder of active) {
      if (reconnect) break;
      const payload = makeCallEvent(reminder);
      const fingerprint = JSON.stringify(payload);
      const mapping = mappings?.find(m => m.reminder_id === reminder.id);
      if (mapping?.fingerprint === fingerprint) continue;
      const base = '/calendar/v3/calendars/primary/events';
      const init = { headers: { 'Content-Type': 'application/json' }, body: fingerprint };
      let response = mapping
        ? await call(`${base}/${encodeURIComponent(mapping.event_id)}`, { ...init, method: 'PUT' }, [404, 410])
        : await call(base, { ...init, method: 'POST' }, [409]);
      if (response && [404, 410].includes(response.status)) response = await call(base, { ...init, method: 'POST' }, [409]);
      if (response?.status === 409) response = await call(`${base}/${payload.id}`, { ...init, method: 'PUT' });
      if (!response) break;
      const { error: saveError } = await supabaseAdmin.from('google_calendar_reminders').upsert({ user_id: context.userId, reminder_id: reminder.id, event_id: payload.id, fingerprint }, { onConflict: 'user_id,reminder_id' });
      if (saveError) throw saveError;
      synced++;
    }
    if (reconnect) return { ...empty, reconnectRequired: true };
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ timeMin: data.from, timeMax: data.to, singleEvents: 'true', orderBy: 'startTime', maxResults: '2500' });
      if (pageToken) query.set('pageToken', pageToken);
      const response = await call(`/calendar/v3/calendars/primary/events?${query}`);
      if (!response) return { ...empty, reconnectRequired: true };
      const body = await response.json() as { nextPageToken?: string; items?: Array<{ id?: string; summary?: string; status?: string; htmlLink?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }> };
      for (const event of body.items ?? []) {
        const start = event.start?.date ?? event.start?.dateTime;
        const end = event.end?.date ?? event.end?.dateTime;
        if (!event.id || !start || !end || event.status === 'cancelled') continue;
        events.push({ id: event.id, title: event.summary ?? 'Busy', start, end, allDay: !!event.start?.date, url: event.htmlLink?.startsWith('https://calendar.google.com/') ? event.htmlLink : null });
      }
      pageToken = body.nextPageToken;
    } while (pageToken);
    return { connected: true, reconnectRequired: false, events, synced };
  });