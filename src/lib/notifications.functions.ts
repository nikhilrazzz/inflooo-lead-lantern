import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { isAllowedEmail } from './access';
import { allowedPushEndpoint } from './notifications';

export const getPushPublicKey = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  if (!isAllowedEmail(String(context.claims.email ?? ''))) throw new Error('Not authorized');
  const { getVapidKeys } = await import('./web-push.server');
  return { publicKey: (await getVapidKeys()).publicKey };
});
export const savePushSubscription = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ endpoint: z.string().max(2048).refine(allowedPushEndpoint), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]+$/).min(80).max(100), auth: z.string().regex(/^[A-Za-z0-9_-]+$/).min(20).max(30) }) }).parse(value))
  .handler(async ({ context, data }) => {
    if (!isAllowedEmail(String(context.claims.email ?? ''))) throw new Error('Not authorized');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: existing } = await supabaseAdmin.from('push_subscriptions').select('user_id').eq('endpoint', data.endpoint).maybeSingle();
    if (existing && existing.user_id !== context.userId) throw new Error('This browser is subscribed to a different user. Disable notifications on that account first.');
    const { error } = await supabaseAdmin.from('push_subscriptions').upsert({ user_id: context.userId, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth }, { onConflict: 'endpoint' });
    if (error) throw error;
    const { error: prefError } = await context.supabase.from('notification_preferences').upsert({ user_id: context.userId, in_app_enabled: true, push_enabled: true });
    if (prefError) throw prefError;
    return { ok: true };
  });
export const disablePush = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  if (!isAllowedEmail(String(context.claims.email ?? ''))) throw new Error('Not authorized');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', context.userId);
  if (error) throw error;
  const { error: prefError } = await context.supabase.from('notification_preferences').upsert({ user_id: context.userId, push_enabled: false });
  if (prefError) throw prefError;
  return { ok: true };
});