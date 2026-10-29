import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMe } from './data';

export function useNotificationPreferences() {
  const { data: me } = useMe();
  return useQuery({ queryKey: ['notification-preferences', me?.id], enabled: !!me, queryFn: async () => {
    if (!me) return { in_app_enabled: true, push_enabled: false };
    const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', me.id).maybeSingle();
    if (error) throw error;
    return data ?? { in_app_enabled: true, push_enabled: false };
  } });
}

export function useAlertReceipts() {
  const { data: me } = useMe();
  return useQuery({ queryKey: ['alert-receipts', me?.id], enabled: !!me, queryFn: async () => {
    if (!me) return [];
    const { data, error } = await supabase.from('notification_receipts').select('event_key,in_app_dismissed').eq('user_id', me.id).eq('in_app_dismissed', true);
    if (error) throw error;
    return data ?? [];
  } });
}