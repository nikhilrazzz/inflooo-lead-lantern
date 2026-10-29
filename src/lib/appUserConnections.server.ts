import { encryptConnectionKey, decryptConnectionKey } from './connectionKeyCrypto.server';

export async function saveConnectionKeyForUser(userId: string, connectorId: string, connectionAPIKey: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('app_user_connections').upsert({ user_id: userId, connector_id: connectorId, connection_key_ciphertext: encryptConnectionKey(connectionAPIKey), reconnect_required: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id,connector_id' });
  if (error) throw error;
}

export async function getConnectionKeyForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.from('app_user_connections').select('connection_key_ciphertext,reconnect_required').eq('user_id', userId).eq('connector_id', connectorId).maybeSingle();
  if (error) throw error;
  return data ? { key: decryptConnectionKey(data.connection_key_ciphertext), reconnectRequired: data.reconnect_required } : null;
}