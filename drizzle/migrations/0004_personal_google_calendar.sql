CREATE TABLE public.app_user_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 connector_id text NOT NULL,
 connection_key_ciphertext text NOT NULL,
 reconnect_required boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, connector_id)
);
GRANT ALL ON public.app_user_connections TO service_role;
REVOKE ALL ON public.app_user_connections FROM anon, authenticated;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.google_calendar_reminders (
 user_id uuid NOT NULL,
 reminder_id uuid NOT NULL,
 event_id text NOT NULL,
 fingerprint text NOT NULL,
 PRIMARY KEY(user_id, reminder_id)
);
GRANT ALL ON public.google_calendar_reminders TO service_role;
REVOKE ALL ON public.google_calendar_reminders FROM anon, authenticated;
ALTER TABLE public.google_calendar_reminders ENABLE ROW LEVEL SECURITY;