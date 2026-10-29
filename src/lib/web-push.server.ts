import { createHash, createECDH } from 'node:crypto';
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { encryptConnectionKey, decryptConnectionKey } from './connectionKeyCrypto.server';
import { allowedPushEndpoint } from './notifications';

export async function getVapidKeys() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('web_push_config').select('*').eq('id', true).maybeSingle();
  if (error) throw error;
  if (data) return { publicKey: data.public_key, privateKey: decryptConnectionKey(data.private_key_ciphertext), subject: 'https://saleup.inflooo.com' };
  const seed = process.env['WEB_PUSH_SIGNING_SEED'];
  if (!seed) throw new Error('Background notification setup is unavailable');
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(createHash('sha256').update(seed).digest());
  const privateKey = ecdh.getPrivateKey().toString('base64url');
  const publicKey = ecdh.getPublicKey().toString('base64url');
  const { error: saveError } = await supabaseAdmin.from('web_push_config').upsert({ id: true, public_key: publicKey, private_key_ciphertext: encryptConnectionKey(privateKey) }, { onConflict: 'id', ignoreDuplicates: true });
  if (saveError) throw saveError;
  return { publicKey, privateKey, subject: 'https://saleup.inflooo.com' };
}

export async function sendDuePush() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const vapid = await getVapidKeys();
  const { data: prefs, error } = await supabaseAdmin.from('notification_preferences').select('user_id').eq('push_enabled', true);
  if (error) throw error;
  let sent = 0;
  for (const pref of prefs ?? []) {
    const { data: profile } = await supabaseAdmin.from('profiles').select('email').eq('id', pref.user_id).maybeSingle();
    const { isAllowedEmail } = await import('./access');
    if (!isAllowedEmail(profile?.email)) continue;
    const { data: reminders, error: reminderError } = await supabaseAdmin.from('reminders').select('*,leads(full_name)').eq('user_id', pref.user_id).eq('completed', false).lte('remind_at', new Date().toISOString()).gte('remind_at', new Date(Date.now() - 86400000).toISOString()).limit(100);
    if (reminderError) throw reminderError;
    const { data: subscriptions, error: subError } = await supabaseAdmin.from('push_subscriptions').select('*').eq('user_id', pref.user_id);
    if (subError) throw subError;
    for (const reminder of reminders ?? []) {
      const eventKey = `${reminder.id}:${reminder.remind_at}`;
      await supabaseAdmin.from('notification_receipts').upsert({ user_id: pref.user_id, event_key: eventKey }, { onConflict: 'user_id,event_key', ignoreDuplicates: true });
      const { data: claimed, error: claimError } = await supabaseAdmin.from('notification_receipts').update({ push_claimed_at: new Date().toISOString() }).eq('user_id', pref.user_id).eq('event_key', eventKey).is('push_sent_at', null).or(`push_claimed_at.is.null,push_claimed_at.lt.${new Date(Date.now() - 300000).toISOString()}`).select('event_key');
      if (claimError) throw claimError;
      if (!claimed?.length) continue;
      let delivered = false;
      for (const sub of subscriptions ?? []) {
        if (!allowedPushEndpoint(sub.endpoint)) continue;
        const payload = await buildPushPayload({ data: JSON.stringify({ title: 'SaleUp: time to call', body: reminder.leads?.full_name || 'Follow-up call', tag: eventKey, url: '/reminders' }), options: { ttl: 300 } }, { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth }, expirationTime: null }, vapid);
        const response = await fetch(sub.endpoint, { ...payload, redirect: 'error' });
        if (response.ok) delivered = true;
        else if ([404, 410].includes(response.status)) await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        else console.error(`Push delivery failed [${response.status}]: ${await response.text()}`);
      }
      const { error: receiptError } = await supabaseAdmin.from('notification_receipts').update(delivered ? { push_sent_at: new Date().toISOString() } : { push_claimed_at: null }).eq('user_id', pref.user_id).eq('event_key', eventKey);
      if (receiptError) throw receiptError;
      if (delivered) sent++;
    }
  }
  return { sent };
}