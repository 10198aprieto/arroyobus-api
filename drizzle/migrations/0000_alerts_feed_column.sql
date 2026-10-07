ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS feed text NOT NULL DEFAULT 'arroyo';
CREATE INDEX IF NOT EXISTS alerts_feed_idx ON public.alerts(feed);